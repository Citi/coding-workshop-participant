import { screen, waitFor, within } from '@testing-library/react';
import UsersPage from '../../pages/UsersPage.jsx';
import { ApiError } from '../../services/apiClient.js';
import { createDepartment, deleteDepartment, listDepartments, updateDepartment } from '../../services/departments.js';
import { createUser, deleteUser, listUsers, updateUser } from '../../services/users.js';
import { PHONE_WIDTH, makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';
import { DEPARTMENTS, USERS } from './testFixtures.js';

vi.mock('../../services/users.js', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock('../../services/departments.js', () => ({
  listDepartments: vi.fn(),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
  deleteDepartment: vi.fn(),
}));

// makeUser() is Vikram Shah, id 2, with the role under test.
function renderPage(role = 'ADMIN', options = {}) {
  return renderWithProviders(<UsersPage />, { route: '/users', auth: makeAuthValue({ user: makeUser(role) }), ...options });
}

async function choose(user, container, comboboxName, optionName) {
  await user.click(within(container).getByRole('combobox', { name: comboboxName }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

beforeEach(() => {
  listUsers.mockResolvedValue(USERS);
  listDepartments.mockResolvedValue(DEPARTMENTS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('UsersPage admin-only actions', () => {
  it('gives an ADMIN create, edit and delete for users and departments, but no self-delete', async () => {
    renderPage('ADMIN');
    const table = await screen.findByRole('table', { name: 'Users' });

    expect(screen.getByRole('button', { name: 'New user' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Edit Priya Nair' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Delete Priya Nair' })).toBeInTheDocument();
    // The signed-in admin's own row is marked and has no delete button.
    const ownRow = within(table).getByText('Vikram Shah').closest('tr');
    expect(within(ownRow).getByText('You')).toBeInTheDocument();
    expect(within(ownRow).getByRole('button', { name: 'Edit Vikram Shah' })).toBeInTheDocument();
    expect(within(ownRow).queryByRole('button', { name: 'Delete Vikram Shah' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'New department' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Engineering' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Engineering' })).toBeInTheDocument();
  });

  it.each(['PM', 'LEAD', 'VIEWER'])('shows %s the lists without any change actions', async (role) => {
    renderPage(role);
    const table = await screen.findByRole('table', { name: 'Users' });
    await screen.findByText('Operations');

    expect(within(table).getByText('Priya Nair')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New user' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Edit|Delete|Rename) / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New department' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('shows roles as their names and people without a department as text', async () => {
    renderPage('ADMIN');
    const table = await screen.findByRole('table', { name: 'Users' });

    const arjun = within(table).getByText('Arjun Mehta').closest('tr');
    expect(within(arjun).getByText('Contributor')).toBeInTheDocument();
    expect(within(arjun).getByText('No department')).toBeInTheDocument();
    expect(within(within(table).getByText('Asha Rao').closest('tr')).getByText('Admin')).toBeInTheDocument();
  });
});

describe('UsersPage users', () => {
  it('filters by search, role and department', async () => {
    const { user } = renderPage('ADMIN');
    await screen.findByRole('table', { name: 'Users' });
    const filters = screen.getByRole('search', { name: 'Filters' });

    await choose(user, filters, 'Role', 'Contributor');
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ role: 'LEAD', limit: 25, offset: 0 }, expect.anything()));
    await choose(user, filters, 'Department', 'Engineering');
    await waitFor(() =>
      expect(listUsers).toHaveBeenLastCalledWith({ role: 'LEAD', department_id: 1, limit: 25, offset: 0 }, expect.anything()),
    );
    await user.type(within(filters).getByRole('searchbox', { name: 'Search users' }), 'priya');
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'priya' }), expect.anything()));
  });

  it('creates a user after checking the password length in bytes', async () => {
    createUser.mockResolvedValue({ ...USERS.items[2], id: 20, name: 'Kiran Bose', email: 'kiran@acme.example' });
    const { user } = renderPage('ADMIN');
    await user.click(await screen.findByRole('button', { name: 'New user' }));
    const dialog = screen.getByRole('dialog', { name: 'New user' });

    await user.type(within(dialog).getByLabelText(/^Full name/), 'Kiran Bose');
    await user.type(within(dialog).getByLabelText(/^Email/), 'kiran@acme.example');
    await user.type(within(dialog).getByLabelText(/^Initial password/), 'short');
    await choose(user, dialog, /^Role/, 'Manager');
    await choose(user, dialog, /^Department/, 'Marketing');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));
    expect(within(dialog).getByText(/Use 8 to 72 bytes/)).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/^Initial password/), '-enough');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith({
        name: 'Kiran Bose',
        email: 'kiran@acme.example',
        password: 'short-enough',
        role: 'PM',
        department_id: 2,
      }),
    );
    expect(await screen.findByText('Created Kiran Bose.')).toBeInTheDocument();
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it('shows a duplicate email from the API next to the field', async () => {
    createUser.mockRejectedValue(
      new ApiError({
        status: 409,
        error: 'CONFLICT',
        message: 'A user with this email already exists.',
        details: [{ field: 'email', issue: 'Already registered.' }],
      }),
    );
    const { user } = renderPage('ADMIN');
    await user.click(await screen.findByRole('button', { name: 'New user' }));
    const dialog = screen.getByRole('dialog', { name: 'New user' });
    await user.type(within(dialog).getByLabelText(/^Full name/), 'Priya Again');
    await user.type(within(dialog).getByLabelText(/^Email/), 'priya.nair@acme.example');
    await user.type(within(dialog).getByLabelText(/^Initial password/), 'long-enough');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(await within(dialog).findByText('Already registered.')).toBeInTheDocument();
    expect(within(dialog).getByText('A user with this email already exists.')).toBeInTheDocument();
    // Inline summary plus the app-wide snackbar (spec 12.4).
    await waitFor(() => expect(screen.getAllByText('A user with this email already exists.')).toHaveLength(2));
  });

  it('edits name, role and department, sending only what changed', async () => {
    updateUser.mockResolvedValue({ ...USERS.items[2], role: 'PM' });
    const { user } = renderPage('ADMIN');
    await user.click(await screen.findByRole('button', { name: 'Edit Priya Nair' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Priya Nair' });

    expect(within(dialog).getByText('Email: priya.nair@acme.example')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/password/i)).not.toBeInTheDocument();
    await choose(user, dialog, /^Role/, 'Manager');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(5, { role: 'PM' }));
    expect(await screen.findByText('Saved Priya Nair.')).toBeInTheDocument();
  });

  it('does not let an admin change their own role', async () => {
    const { user } = renderPage('ADMIN');
    await user.click(await screen.findByRole('button', { name: 'Edit Vikram Shah' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Vikram Shah' });

    expect(within(dialog).getByText('You cannot change your own role.')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: /^Role/ })).toHaveAttribute('aria-disabled', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Nothing changed.')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('deletes a user only after confirmation', async () => {
    deleteUser.mockResolvedValue(null);
    const { user } = renderPage('ADMIN');
    await user.click(await screen.findByRole('button', { name: 'Delete Arjun Mehta' }));

    const confirm = screen.getByRole('dialog', { name: 'Delete user?' });
    expect(confirm).toHaveTextContent('Arjun Mehta (arjun.mehta@acme.example) will lose access.');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete user?' })).not.toBeInTheDocument());
    expect(deleteUser).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete Arjun Mehta' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete user?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith(6));
    expect(await screen.findByText('Deleted Arjun Mehta.')).toBeInTheDocument();
  });

  it('uses stacked cards on phones with the same actions', async () => {
    renderPage('ADMIN', { width: PHONE_WIDTH });

    const list = await screen.findByRole('list', { name: 'Users' });
    expect(within(list).getByRole('button', { name: 'Edit Priya Nair' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Users' })).not.toBeInTheDocument();
  });
});

describe('UsersPage departments', () => {
  it('creates and renames departments', async () => {
    createDepartment.mockResolvedValue({ id: 9, name: 'Legal', created_at: '2026-11-24T18:00:00Z' });
    updateDepartment.mockResolvedValue({ id: 2, name: 'Brand', created_at: '2026-11-24T18:00:00Z' });
    const { user } = renderPage('ADMIN');

    await user.click(await screen.findByRole('button', { name: 'New department' }));
    let dialog = screen.getByRole('dialog', { name: 'New department' });
    await user.click(within(dialog).getByRole('button', { name: 'Create department' }));
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Department name/), '  Legal ');
    await user.click(within(dialog).getByRole('button', { name: 'Create department' }));
    await waitFor(() => expect(createDepartment).toHaveBeenCalledWith({ name: 'Legal' }));
    expect(await screen.findByText('Created the Legal department.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename Marketing' }));
    dialog = screen.getByRole('dialog', { name: 'Rename Marketing' });
    const name = within(dialog).getByLabelText(/^Department name/);
    await user.clear(name);
    await user.type(name, 'Brand');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(updateDepartment).toHaveBeenCalledWith(2, { name: 'Brand' }));
    // Departments and users (whose department names may change) both reload.
    await waitFor(() => expect(listDepartments).toHaveBeenCalledTimes(3));
    expect(listUsers).toHaveBeenCalledTimes(3);
  });

  it('keeps a clashing rename open, with the API message inline and in the snackbar', async () => {
    updateDepartment.mockRejectedValue(
      new ApiError({ status: 409, error: 'CONFLICT', message: 'A department with this name already exists.' }),
    );
    const { user } = renderPage('ADMIN');
    await user.click(await screen.findByRole('button', { name: 'Rename Marketing' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename Marketing' });
    const name = within(dialog).getByLabelText(/^Department name/);
    await user.clear(name);
    await user.type(name, 'Engineering');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(await within(dialog).findByText('A department with this name already exists.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('A department with this name already exists.')).toHaveLength(2));
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeEnabled();
  });

  it('shows the API message when a department in use cannot be deleted', async () => {
    deleteDepartment.mockRejectedValue(
      new ApiError({
        status: 409,
        error: 'CONFLICT',
        message: "Department 'Engineering' still has 1 project. Move or delete them first.",
      }),
    );
    const { user } = renderPage('ADMIN');
    await user.click(await screen.findByRole('button', { name: 'Delete Engineering' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete department?' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteDepartment).toHaveBeenCalledWith(1));
    expect(
      await screen.findByText(
        "Engineering was not deleted. Department 'Engineering' still has 1 project. Move or delete them first.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/still has 1 project/)).toHaveLength(2);
  });
});
