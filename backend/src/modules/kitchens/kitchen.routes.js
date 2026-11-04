import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

/**
 * GET /api/kitchens[?unitId=<org-unit-id>]
 *
 * Returns the active service kitchens in the shape the mobile app expects.
 * When `unitId` is supplied, only the kitchens linked to that org unit are
 * returned (via org_unit_kitchens); the full active list is returned otherwise.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const unitId = req.query.unitId ? String(req.query.unitId) : null;

    let rows;
    if (unitId) {
      [rows] = await pool.execute(
        `SELECT k.id, k.code, k.name_ar, k.name_en, k.scope_ar, k.scope_en
         FROM kitchens k
         JOIN org_unit_kitchens ouk ON ouk.kitchen_id = k.id
         WHERE ouk.org_unit_id = ? AND k.is_active = 1
         ORDER BY k.name_ar`,
        [unitId]
      );
    } else {
      [rows] = await pool.execute(
        `SELECT id, code, name_ar, name_en, scope_ar, scope_en
         FROM kitchens
         WHERE is_active = 1
         ORDER BY name_ar`
      );
    }

    const kitchens = rows.map((k) => ({
      id: k.id,
      code: k.code,
      name: k.name_ar,
      nameAr: k.name_ar,
      nameEn: k.name_en || k.name_ar,
      scope: k.scope_ar,
      scopeAr: k.scope_ar,
      scopeEn: k.scope_en || k.scope_ar,
      isKitchen: true,
    }));

    res.json({ success: true, kitchens });
  } catch (err) {
    next(err);
  }
});

export default router;
