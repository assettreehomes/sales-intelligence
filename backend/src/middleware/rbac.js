/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * User Roles:
 * - employee: Can only upload audio (blind mode)
 * - admin: Full access to everything
 * - intern: Can only view training library (read-only)
 */

// Role hierarchy for permission checking
const ROLE_PERMISSIONS = {
    admin: ['admin', 'employee', 'intern'], // Admin can do everything
    employee: ['employee'],
    intern: ['intern']
};

/**
 * Check if user has required role
 */
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required'
            });
        }

        // Superadmin bypass
        if (req.user.role === 'superadmin') {
            return next();
        }

        const userRole = req.user.role;

        // Superadmin has access to everything
        if (userRole === 'superadmin') {
            return next();
        }

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                required: allowedRoles,
                current: userRole
            });
        }

        next();
    };
}

/**
 * Require admin role
 */
export const requireAdmin = requireRole('admin');

/**
 * Require employee role (employees and admins)
 */
export const requireEmployee = requireRole('employee', 'admin');

/**
 * Require intern role (interns and admins)
 */
export const requireIntern = requireRole('intern', 'admin');

/**
 * Check if user can access specific resource
 */
export function canAccessTicket(req, res, next) {
    const { user } = req;
    const { id: ticketId } = req.params;

    // Admins and Superadmins can access any ticket
    if (user.role === 'admin' || user.role === 'superadmin') {
        return next();
    }

    // Employees can only access their own tickets
    if (user.role === 'employee') {
        // Will be checked in the route handler
        req.checkOwnership = true;
        return next();
    }

    // Interns cannot access regular tickets
    return res.status(403).json({
        error: 'Interns can only access training library'
    });
}

/**
 * Middleware to check employee can only see own drafts
 */
export function filterByRole(req, res, next) {
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        req.roleFilter = null; // No filter for admin/superadmin
    } else if (req.user.role === 'employee') {
        req.roleFilter = { created_by: req.user.id };
    } else {
        req.roleFilter = { is_training_call: true, rating: { gte: 4.0 } };
    }
    next();
}

export default { requireRole, requireAdmin, requireEmployee, requireIntern };
