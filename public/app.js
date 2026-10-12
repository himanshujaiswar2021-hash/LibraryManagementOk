const state = {
  overview: null,
  books: [],
  members: [],
  loans: [],
  view: 'overview',
  loanFilter: 'all',
  dialogType: null,
  editingId: null,
  toastTimer: null
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);
const formatDate = (value) => value
  ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  : '—';

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(result?.error || `Request failed (${response.status}).`);
  }
  return result;
}

function notify(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3400);
}

async function loadData() {
  try {
    const [overview, books, members, loans] = await Promise.all([
      api('/api/overview'),
      api('/api/books'),
      api('/api/members'),
      api('/api/loans')
    ]);
    state.overview = overview;
    state.books = books;
    state.members = members;
    state.loans = loans;
    render();
  } catch (error) {
    notify(error.message, true);
  }
}

function render() {
  renderOverview();
  renderBooks();
  renderMembers();
  renderLoans();
  renderIssueOptions();
}

function renderOverview() {
  if (!state.overview) return;
  const items = [
    { label: 'Book titles', value: state.overview.book_titles, note: `${state.overview.total_copies} copies in your collection`, icon: '▤' },
    { label: 'Registered members', value: state.overview.members, note: 'Readers in your community', icon: '♧' },
    { label: 'Books on loan', value: state.overview.active_loans, note: 'Currently checked out', icon: '↗' },
    { label: 'Overdue returns', value: state.overview.overdue_loans, note: 'Need a friendly reminder', icon: '◷', tone: 'amber' }
  ];
  $('#stats-grid').innerHTML = items.map((item) => `
    <article class="stat-card" data-icon="${item.icon}" data-tone="${item.tone || ''}">
      <p class="stat-label">${item.label}</p>
      <p class="stat-value">${item.value}</p>
      <p class="stat-footnote">${item.note}</p>
    </article>`).join('');

  const recent = state.loans.slice(0, 5);
  $('#recent-loans').innerHTML = recent.length
    ? `<div class="table-wrap"><table><thead><tr><th>Book</th><th>Member</th><th>Issued</th><th>Due date</th><th>Status</th></tr></thead><tbody>${recent.map(loanRow).join('')}</tbody></table></div>`
    : emptyState('No transactions yet', 'Issue a book to see your recent activity here.');
}

function emptyState(title, detail) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(detail)}</div>`;
}

function renderBooks() {
  const query = $('#books-search').value.trim().toLocaleLowerCase();
  const books = state.books.filter((book) => [book.title, book.author, book.isbn, book.category]
    .some((value) => String(value || '').toLocaleLowerCase().includes(query)));
  $('#books-count').textContent = `${books.length} ${books.length === 1 ? 'book' : 'books'}`;
  $('#books-table').innerHTML = books.length ? `
    <table><thead><tr><th>Book</th><th>ISBN</th><th>Category</th><th>Copies</th><th>Availability</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${books.map((book) => `<tr>
      <td><span class="primary-cell">${escapeHtml(book.title)}</span><span class="secondary-cell">${escapeHtml(book.author)}</span></td>
      <td>${escapeHtml(book.isbn || '—')}</td>
      <td>${escapeHtml(book.category)}</td>
      <td>${book.copies}</td>
      <td><span class="pill ${book.available_copies === 0 ? 'overdue' : book.available_copies < book.copies ? 'available-low' : ''}">${book.available_copies} available</span></td>
      <td><div class="row-actions">
        <button class="small-button" type="button" data-edit="book" data-id="${book.id}">Edit</button>
        <button class="small-button danger" type="button" data-delete="book" data-id="${book.id}">Delete</button>
      </div></td>
    </tr>`).join('')}</tbody></table>`
    : emptyState(query ? 'No matching books' : 'Your catalogue is empty', query ? 'Try another search term.' : 'Add your first book to get started.');
}

function renderMembers() {
  const query = $('#members-search').value.trim().toLocaleLowerCase();
  const members = state.members.filter((member) => [member.name, member.email, member.phone]
    .some((value) => String(value || '').toLocaleLowerCase().includes(query)));
  $('#members-count').textContent = `${members.length} ${members.length === 1 ? 'member' : 'members'}`;
  $('#members-table').innerHTML = members.length ? `
    <table><thead><tr><th>Member</th><th>Email</th><th>Phone</th><th>Member since</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${members.map((member) => `<tr>
      <td><span class="primary-cell">${escapeHtml(member.name)}</span></td>
      <td>${escapeHtml(member.email)}</td>
      <td>${escapeHtml(member.phone || '—')}</td>
      <td>${formatDate(member.created_at)}</td>
      <td><div class="row-actions">
        <button class="small-button" type="button" data-edit="member" data-id="${member.id}">Edit</button>
        <button class="small-button danger" type="button" data-delete="member" data-id="${member.id}">Delete</button>
      </div></td>
    </tr>`).join('')}</tbody></table>`
    : emptyState(query ? 'No matching members' : 'No members yet', query ? 'Try another search term.' : 'Add a member to start lending books.');
}

function loanStatus(loan) {
  if (loan.returned_on) return { label: 'Returned', className: 'returned' };
  if (loan.due_date < new Date().toISOString().slice(0, 10)) return { label: 'Overdue', className: 'overdue' };
  return { label: 'On loan', className: '' };
}

function loanRow(loan, includeActions = false) {
  const status = loanStatus(loan);
  return `<tr>
    <td><span class="primary-cell">${escapeHtml(loan.book_title)}</span><span class="secondary-cell">${escapeHtml(loan.book_author)}</span></td>
    <td><span class="primary-cell">${escapeHtml(loan.member_name)}</span><span class="secondary-cell">${escapeHtml(loan.member_email)}</span></td>
    <td>${formatDate(loan.issued_on)}</td>
    <td>${formatDate(loan.due_date)}${loan.returned_on ? `<span class="secondary-cell">Returned ${formatDate(loan.returned_on)}</span>` : ''}</td>
    <td><span class="pill ${status.className}">${status.label}</span></td>
    ${includeActions ? `<td>${loan.returned_on ? '' : `<button class="small-button" type="button" data-return="${loan.id}">Mark returned</button>`}</td>` : ''}
  </tr>`;
}

function renderLoans() {
  const filter = state.loanFilter;
  const loans = state.loans.filter((loan) => {
    if (filter === 'returned') return Boolean(loan.returned_on);
    if (filter === 'active') return !loan.returned_on;
    if (filter === 'overdue') return !loan.returned_on && loan.due_date < new Date().toISOString().slice(0, 10);
    return true;
  });
  $('#loans-count').textContent = `${loans.length} ${loans.length === 1 ? 'transaction' : 'transactions'}`;
  $('#loans-table').innerHTML = loans.length ? `
    <table><thead><tr><th>Book</th><th>Member</th><th>Issued</th><th>Due date</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${loans.map((loan) => loanRow(loan, true)).join('')}</tbody></table>`
    : emptyState('Nothing to show', filter === 'all' ? 'Issue a book to create your first transaction.' : 'There are no transactions in this view.');
}

function renderIssueOptions() {
  const bookSelect = $('#issue-book');
  const memberSelect = $('#issue-member');
  const selectedBook = bookSelect.value;
  const selectedMember = memberSelect.value;
  const availableBooks = state.books.filter((book) => book.available_copies > 0);
  bookSelect.innerHTML = availableBooks.length
    ? `<option value="">Choose a book…</option>${availableBooks.map((book) => `<option value="${book.id}">${escapeHtml(book.title)} — ${book.available_copies} available</option>`).join('')}`
    : '<option value="">No books available</option>';
  memberSelect.innerHTML = state.members.length
    ? `<option value="">Choose a member…</option>${state.members.map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join('')}`
    : '<option value="">Add a member first</option>';
  if (availableBooks.some((book) => String(book.id) === selectedBook)) bookSelect.value = selectedBook;
  if (state.members.some((member) => String(member.id) === selectedMember)) memberSelect.value = selectedMember;
  $('#issue-form button[type="submit"]').disabled = availableBooks.length === 0 || state.members.length === 0;
}

const bookFields = [
  { name: 'title', label: 'Title', placeholder: 'e.g. The Great Gatsby', maxLength: 200, required: true },
  { name: 'author', label: 'Author', placeholder: 'e.g. F. Scott Fitzgerald', maxLength: 160, required: true },
  { name: 'isbn', label: 'ISBN', placeholder: 'Optional', maxLength: 32 },
  { name: 'category', label: 'Category', placeholder: 'e.g. Fiction', maxLength: 80 },
  { name: 'copies', label: 'Number of copies', type: 'number', min: 1, max: 100000, required: true }
];
const memberFields = [
  { name: 'name', label: 'Full name', placeholder: 'e.g. Alex Morgan', maxLength: 160, required: true },
  { name: 'email', label: 'Email address', type: 'email', placeholder: 'alex@example.com', maxLength: 254, required: true },
  { name: 'phone', label: 'Phone number', placeholder: 'Optional', maxLength: 40 }
];

function openRecordDialog(type, record = null) {
  state.dialogType = type;
  state.editingId = record?.id || null;
  const fields = type === 'book' ? bookFields : memberFields;
  $('#dialog-eyebrow').textContent = state.editingId ? `EDIT ${type.toUpperCase()}` : `NEW ${type.toUpperCase()}`;
  $('#dialog-title').textContent = state.editingId ? `Edit ${type}` : `Add a ${type}`;
  $('#dialog-save').textContent = state.editingId ? 'Save changes' : `Add ${type}`;
  $('#dialog-fields').innerHTML = fields.map((field) => `
    <label class="field"><span>${field.label}</span>
      <input name="${field.name}" type="${field.type || 'text'}" placeholder="${field.placeholder || ''}"
        ${field.maxLength ? `maxlength="${field.maxLength}"` : ''}
        ${field.min ? `min="${field.min}"` : ''} ${field.max ? `max="${field.max}"` : ''}
        ${field.required ? 'required' : ''}
        value="${escapeHtml(record?.[field.name] ?? (field.name === 'category' ? 'General' : field.name === 'copies' ? 1 : ''))}">
    </label>`).join('');
  $('#record-dialog').showModal();
  $('#dialog-fields input').focus();
}

function closeRecordDialog() {
  $('#record-dialog').close();
}

async function submitRecord(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  if (state.dialogType === 'book') body.copies = Number(body.copies);
  const type = state.dialogType;
  const endpoint = `/api/${type}s${state.editingId ? `/${state.editingId}` : ''}`;
  try {
    await api(endpoint, {
      method: state.editingId ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    closeRecordDialog();
    notify(`${type === 'book' ? 'Book' : 'Member'} ${state.editingId ? 'updated' : 'added'} successfully.`);
    await loadData();
  } catch (error) {
    notify(error.message, true);
  }
}

async function deleteRecord(type, id) {
  const record = (type === 'book' ? state.books : state.members).find((item) => item.id === Number(id));
  const name = record?.title || record?.name || 'this record';
  if (!window.confirm(`Delete "${name}"? Records with loan history cannot be deleted.`)) return;
  try {
    await api(`/api/${type}s/${id}`, { method: 'DELETE' });
    notify(`${type === 'book' ? 'Book' : 'Member'} deleted.`);
    await loadData();
  } catch (error) {
    notify(error.message, true);
  }
}

async function issueLoan(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  body.bookId = Number(body.bookId);
  body.memberId = Number(body.memberId);
  try {
    await api('/api/loans', { method: 'POST', body: JSON.stringify(body) });
    event.currentTarget.reset();
    setDefaultDueDate();
    notify('Book issued successfully.');
    await loadData();
  } catch (error) {
    notify(error.message, true);
  }
}

async function markReturned(id) {
  try {
    await api(`/api/loans/${id}/return`, { method: 'POST' });
    notify('Book marked as returned.');
    await loadData();
  } catch (error) {
    notify(error.message, true);
  }
}

function setDefaultDueDate() {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);
  $('#issue-due-date').value = dueDate.toISOString().slice(0, 10);
  $('#issue-due-date').min = new Date().toISOString().slice(0, 10);
}

function showView(view) {
  state.view = view;
  document.querySelectorAll('.page-view').forEach((section) => {
    section.classList.toggle('is-visible', section.id === `view-${view}`);
  });
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  $('#page-name').textContent = view === 'overview'
    ? 'Overview'
    : view === 'loans' ? 'Issue & return' : view[0].toUpperCase() + view.slice(1);
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.view) showView(target.dataset.view);
  if (target.dataset.go) showView(target.dataset.go);
  if (target.dataset.add) openRecordDialog(target.dataset.add);
  if (target.dataset.edit) {
    const records = target.dataset.edit === 'book' ? state.books : state.members;
    const record = records.find((item) => item.id === Number(target.dataset.id));
    if (record) openRecordDialog(target.dataset.edit, record);
  }
  if (target.dataset.delete) deleteRecord(target.dataset.delete, target.dataset.id);
  if (target.dataset.return) markReturned(target.dataset.return);
  if (target.id === 'dialog-close' || target.id === 'dialog-cancel') closeRecordDialog();
});

$('#record-form').addEventListener('submit', submitRecord);
$('#issue-form').addEventListener('submit', issueLoan);
$('#books-search').addEventListener('input', renderBooks);
$('#members-search').addEventListener('input', renderMembers);
$('#loan-filter').addEventListener('change', (event) => {
  state.loanFilter = event.target.value;
  renderLoans();
});
$('#record-dialog').addEventListener('click', (event) => {
  if (event.target === $('#record-dialog')) closeRecordDialog();
});
$('#today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
setDefaultDueDate();
loadData();
