import { AppError } from '../../lib/errors.js';
import { listEmployeesQuerySchema, updateEmployeeSchema } from './employee.schemas.js';
import * as employeeService from './employee.service.js';

function validationError(parsed) {
  const seen = new Set();
  const details = [];
  for (const issue of parsed.error.issues) {
    const field = issue.path.join('.') || '(root)';
    if (seen.has(field)) continue;
    seen.add(field);
    details.push({ field, message: issue.message });
  }
  return new AppError(422, 'VALIDATION_ERROR', 'Invalid request', details);
}

function parse(schema, payload) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw validationError(parsed);
  return parsed.data;
}

export async function listEmployees(req, res, next) {
  try {
    const query = parse(listEmployeesQuerySchema, req.query);
    const employees = await employeeService.listEmployees(query);
    res.json({ success: true, employees, total: employees.length });
  } catch (err) {
    next(err);
  }
}

export async function getEmployee(req, res, next) {
  try {
    const employee = await employeeService.getEmployee(req.params.id);
    res.json({ success: true, employee });
  } catch (err) {
    next(err);
  }
}

export async function listRoles(_req, res, next) {
  try {
    res.json({ success: true, roles: await employeeService.listRoleOptions() });
  } catch (err) {
    next(err);
  }
}

export async function updateEmployee(req, res, next) {
  try {
    const input = parse(updateEmployeeSchema, req.body);
    const employee = await employeeService.updateEmployee(
      req.params.id,
      input,
      { id: req.user?.id, isGlobal: true, scopes: [] },
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    res.json({ success: true, employee });
  } catch (err) {
    next(err);
  }
}
