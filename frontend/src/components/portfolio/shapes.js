/**
 * PropTypes shapes for the API records the portfolio pages pass between components
 * (field names follow CONTRACT section 4).
 */
import PropTypes from 'prop-types';

/** A `{ value, label }` select option; values are strings. */
export const optionShape = PropTypes.shape({
  value: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
});

/** `DeliverableOut`. */
export const deliverableShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  project_id: PropTypes.number.isRequired,
  project_name: PropTypes.string,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  assigned_user_id: PropTypes.number,
  assigned_user_name: PropTypes.string,
  start_date: PropTypes.string,
  due_date: PropTypes.string.isRequired,
  completion_percentage: PropTypes.number.isRequired,
  status: PropTypes.string.isRequired,
  blocked_reason: PropTypes.string,
  is_overdue: PropTypes.bool,
});

/** `AllocationOut`. */
export const allocationShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  user_id: PropTypes.number.isRequired,
  user_name: PropTypes.string,
  project_id: PropTypes.number.isRequired,
  project_name: PropTypes.string,
  deliverable_id: PropTypes.number,
  deliverable_title: PropTypes.string,
  allocation_percentage: PropTypes.number.isRequired,
  start_date: PropTypes.string.isRequired,
  end_date: PropTypes.string.isRequired,
});

/** `UserOut`. */
export const userShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  role: PropTypes.string.isRequired,
  department_id: PropTypes.number,
  department_name: PropTypes.string,
});

/** `DepartmentOut`. */
export const departmentShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  created_at: PropTypes.string,
});
