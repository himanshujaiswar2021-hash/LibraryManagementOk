const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  LibraryError,
  initDb,
  getOverview,
  getBooks,
  saveBook,
  deleteBook,
  getMembers,
  saveMember,
  deleteMember,
  getLoans,
  issueBook,
  returnBook
} = require('./db');

const port = Number(process.env.PORT || 3000);
const publicDirectory = path.join(__dirname, 'public');
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8']
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1024 * 1024) {
      throw new LibraryError('Request body is too large.', 413);
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new LibraryError('Request body must be valid JSON.', 400);
  }
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LibraryError(`${label} is required.`, 400);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new LibraryError(`${label} must be ${maxLength} characters or fewer.`, 400);
  }
  return text;
}

function validateObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new LibraryError('Request body must be a JSON object.', 400);
  }
  return body;
}

function validateBook(body) {
  body = validateObject(body);
  const title = requiredText(body.title, 'Title', 200);
  const author = requiredText(body.author, 'Author', 160);
  const category = typeof body.category === 'string' && body.category.trim()
    ? requiredText(body.category, 'Category', 80)
    : 'General';
  const isbn = typeof body.isbn === 'string' ? body.isbn.trim() : '';
  if (isbn.length > 32) {
    throw new LibraryError('ISBN must be 32 characters or fewer.', 400);
  }
  const copies = Number(body.copies);
  if (!Number.isSafeInteger(copies) || copies < 1 || copies > 100000) {
    throw new LibraryError('Copies must be a whole number between 1 and 100000.', 400);
  }
  return { title, author, isbn, category, copies };
}

function validateMember(body) {
  body = validateObject(body);
  const name = requiredText(body.name, 'Name', 160);
  const email = requiredText(body.email, 'Email', 254).toLowerCase();
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new LibraryError('Enter a valid email address.', 400);
  }
  if (phone.length > 40) {
    throw new LibraryError('Phone must be 40 characters or fewer.', 400);
  }
  return { name, email, phone };
}

function validateId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new LibraryError('Invalid record ID.', 400);
  }
  return id;
}

function validateDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new LibraryError('Choose a valid due date.', 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new LibraryError('Choose a valid due date.', 400);
  }
  if (value < new Date().toISOString().slice(0, 10)) {
    throw new LibraryError('Due date cannot be in the past.', 400);
  }
  return value;
}

function handleDelete(operation, id, label) {
  try {
    if (!operation(id)) {
      throw new LibraryError(`${label} not found.`, 404);
    }
  } catch (error) {
    if (error.errcode === 1811 || error.errcode === 787) {
      throw new LibraryError(`Cannot delete this ${label.toLowerCase()} because it has loan history.`, 409);
    }
    throw error;
  }
}

async function handleApi(request, response, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/overview' && method === 'GET') {
    sendJson(response, 200, getOverview());
    return;
  }
  if (pathname === '/api/books' && method === 'GET') {
    sendJson(response, 200, getBooks((url.searchParams.get('q') || '').trim()));
    return;
  }
  if (pathname === '/api/books' && method === 'POST') {
    sendJson(response, 201, { book: saveBook(validateBook(await readJson(request))) });
    return;
  }
  const bookMatch = pathname.match(/^\/api\/books\/(\d+)$/);
  if (bookMatch && method === 'PUT') {
    const book = saveBook(validateBook(await readJson(request)), validateId(bookMatch[1]));
    if (!book) {
      throw new LibraryError('Book not found.', 404);
    }
    sendJson(response, 200, { book });
    return;
  }
  if (bookMatch && method === 'DELETE') {
    handleDelete(deleteBook, validateId(bookMatch[1]), 'Book');
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === '/api/members' && method === 'GET') {
    sendJson(response, 200, getMembers((url.searchParams.get('q') || '').trim()));
    return;
  }
  if (pathname === '/api/members' && method === 'POST') {
    sendJson(response, 201, { member: saveMember(validateMember(await readJson(request))) });
    return;
  }
  const memberMatch = pathname.match(/^\/api\/members\/(\d+)$/);
  if (memberMatch && method === 'PUT') {
    const member = saveMember(validateMember(await readJson(request)), validateId(memberMatch[1]));
    if (!member) {
      throw new LibraryError('Member not found.', 404);
    }
    sendJson(response, 200, { member });
    return;
  }
  if (memberMatch && method === 'DELETE') {
    handleDelete(deleteMember, validateId(memberMatch[1]), 'Member');
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === '/api/loans' && method === 'GET') {
    sendJson(response, 200, getLoans());
    return;
  }
  if (pathname === '/api/loans' && method === 'POST') {
    const body = validateObject(await readJson(request));
    const bookId = validateId(body.bookId);
    const memberId = validateId(body.memberId);
    const dueDate = validateDueDate(body.dueDate);
    sendJson(response, 201, { loan: issueBook(bookId, memberId, dueDate) });
    return;
  }
  const returnMatch = pathname.match(/^\/api\/loans\/(\d+)\/return$/);
  if (returnMatch && method === 'POST') {
    sendJson(response, 200, { loan: returnBook(validateId(returnMatch[1])) });
    return;
  }

  throw new LibraryError('API endpoint not found.', 404);
}

function serveStatic(response, pathname) {
  const file = staticFiles[pathname];
  if (!file) {
    sendJson(response, 404, { error: 'Page not found.' });
    return;
  }
  const content = fs.readFileSync(path.join(publicDirectory, file[0]));
  response.writeHead(200, { 'Content-Type': file[1] });
  response.end(content);
}

initDb();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      throw new LibraryError('Method not allowed.', 405);
    }
    serveStatic(response, url.pathname);
  } catch (error) {
    const statusCode = error instanceof LibraryError ? error.statusCode : (
      error.errcode === 2067 ? 409 : 500
    );
    if (statusCode === 500) {
      console.error(error);
    }
    const message = statusCode === 409 && error.errcode === 2067
      ? 'A record with that ISBN or email already exists.'
      : error instanceof LibraryError ? error.message : 'An unexpected server error occurred.';
    sendJson(response, statusCode, { error: message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Library system is running at http://localhost:${port}`);
  console.log(`SQLite database: ${path.join(__dirname, 'data', 'library.db')}`);
});
