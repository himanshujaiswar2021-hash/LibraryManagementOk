const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDirectory = path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new DatabaseSync(path.join(dataDirectory, 'library.db'));

class LibraryError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function initDb() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      isbn TEXT UNIQUE,
      category TEXT NOT NULL DEFAULT 'General',
      copies INTEGER NOT NULL CHECK (copies > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      issued_on TEXT NOT NULL DEFAULT (date('now')),
      due_date TEXT NOT NULL,
      returned_on TEXT,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_loans_active_book
      ON loans(book_id, returned_on);
    CREATE INDEX IF NOT EXISTS idx_loans_member
      ON loans(member_id);
  `);
}

function getOverview() {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM books) AS book_titles,
      (SELECT COALESCE(SUM(copies), 0) FROM books) AS total_copies,
      (SELECT COUNT(*) FROM members) AS members,
      (SELECT COUNT(*) FROM loans WHERE returned_on IS NULL) AS active_loans,
      (SELECT COUNT(*) FROM loans
        WHERE returned_on IS NULL AND due_date < date('now')) AS overdue_loans
  `).get();
}

function getBooks(search = '') {
  const term = `%${search}%`;
  return db.prepare(`
    SELECT
      books.*,
      books.copies - (
        SELECT COUNT(*) FROM loans
        WHERE loans.book_id = books.id AND loans.returned_on IS NULL
      ) AS available_copies
    FROM books
    WHERE ? = ''
      OR title LIKE ? COLLATE NOCASE
      OR author LIKE ? COLLATE NOCASE
      OR COALESCE(isbn, '') LIKE ? COLLATE NOCASE
      OR category LIKE ? COLLATE NOCASE
    ORDER BY title COLLATE NOCASE, id
  `).all(search, term, term, term, term);
}

function getBookById(id) {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(id) || null;
}

function saveBook(book, id = null) {
  if (id === null) {
    const result = db.prepare(`
      INSERT INTO books (title, author, isbn, category, copies)
      VALUES (?, ?, ?, ?, ?)
    `).run(book.title, book.author, book.isbn || null, book.category, book.copies);
    return getBookById(Number(result.lastInsertRowid));
  }

  const activeLoans = db.prepare(`
    SELECT COUNT(*) AS count FROM loans
    WHERE book_id = ? AND returned_on IS NULL
  `).get(id)?.count;
  if (activeLoans === undefined) {
    return null;
  }
  if (book.copies < activeLoans) {
    throw new LibraryError(
      `Copies cannot be fewer than the ${activeLoans} copy${activeLoans === 1 ? '' : 'ies'} currently on loan.`,
      409
    );
  }

  const result = db.prepare(`
    UPDATE books
    SET title = ?, author = ?, isbn = ?, category = ?, copies = ?
    WHERE id = ?
  `).run(book.title, book.author, book.isbn || null, book.category, book.copies, id);
  return result.changes ? getBookById(id) : null;
}

function deleteBook(id) {
  const result = db.prepare('DELETE FROM books WHERE id = ?').run(id);
  return result.changes > 0;
}

function getMembers(search = '') {
  const term = `%${search}%`;
  return db.prepare(`
    SELECT *
    FROM members
    WHERE ? = ''
      OR name LIKE ? COLLATE NOCASE
      OR email LIKE ? COLLATE NOCASE
      OR phone LIKE ? COLLATE NOCASE
    ORDER BY name COLLATE NOCASE, id
  `).all(search, term, term, term);
}

function getMemberById(id) {
  return db.prepare('SELECT * FROM members WHERE id = ?').get(id) || null;
}

function saveMember(member, id = null) {
  if (id === null) {
    const result = db.prepare(`
      INSERT INTO members (name, email, phone)
      VALUES (?, ?, ?)
    `).run(member.name, member.email, member.phone);
    return getMemberById(Number(result.lastInsertRowid));
  }

  const result = db.prepare(`
    UPDATE members SET name = ?, email = ?, phone = ? WHERE id = ?
  `).run(member.name, member.email, member.phone, id);
  return result.changes ? getMemberById(id) : null;
}

function deleteMember(id) {
  const result = db.prepare('DELETE FROM members WHERE id = ?').run(id);
  return result.changes > 0;
}

function getLoans() {
  return db.prepare(`
    SELECT
      loans.*,
      books.title AS book_title,
      books.author AS book_author,
      members.name AS member_name,
      members.email AS member_email
    FROM loans
    JOIN books ON books.id = loans.book_id
    JOIN members ON members.id = loans.member_id
    ORDER BY loans.returned_on IS NULL DESC, loans.issued_on DESC, loans.id DESC
  `).all();
}

function getLoanById(id) {
  return db.prepare(`
    SELECT
      loans.*,
      books.title AS book_title,
      books.author AS book_author,
      members.name AS member_name,
      members.email AS member_email
    FROM loans
    JOIN books ON books.id = loans.book_id
    JOIN members ON members.id = loans.member_id
    WHERE loans.id = ?
  `).get(id) || null;
}

function issueBook(bookId, memberId, dueDate) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const book = getBookById(bookId);
    if (!book) {
      throw new LibraryError('Book not found.', 404);
    }
    if (!getMemberById(memberId)) {
      throw new LibraryError('Member not found.', 404);
    }

    const activeLoans = db.prepare(`
      SELECT COUNT(*) AS count FROM loans
      WHERE book_id = ? AND returned_on IS NULL
    `).get(bookId).count;
    if (activeLoans >= book.copies) {
      throw new LibraryError('No copies of this book are currently available.', 409);
    }

    const result = db.prepare(`
      INSERT INTO loans (book_id, member_id, due_date)
      VALUES (?, ?, ?)
    `).run(bookId, memberId, dueDate);
    const loan = getLoanById(Number(result.lastInsertRowid));
    db.exec('COMMIT');
    return loan;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function returnBook(id) {
  const result = db.prepare(`
    UPDATE loans SET returned_on = date('now')
    WHERE id = ? AND returned_on IS NULL
  `).run(id);

  if (result.changes) {
    return getLoanById(id);
  }
  if (!getLoanById(id)) {
    throw new LibraryError('Loan not found.', 404);
  }
  throw new LibraryError('This book has already been returned.', 409);
}

module.exports = {
  LibraryError,
  initDb,
  getOverview,
  getBooks,
  getBookById,
  saveBook,
  deleteBook,
  getMembers,
  getMemberById,
  saveMember,
  deleteMember,
  getLoans,
  issueBook,
  returnBook
};
