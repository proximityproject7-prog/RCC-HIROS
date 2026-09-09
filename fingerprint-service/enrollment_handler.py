"""Enrollment handler — manages fingerprint capture and DB storage.

Enrollment flow:
1. enroll_begin
2. enroll_capture (repeat until more_required=False)
3. enroll_commit → get GUID
4. insert GUID into biometrictemplate table

Requires: employee_id and finger_index from the client.
"""
import winbio_api as wb
import database as db
from config import MAX_TEMPLATES_PER_EMPLOYEE


def handle_enroll(employee_id: str, finger_index: int) -> dict:
    """Run full enrollment flow for one finger.

    Returns dict with keys: success, message, template (optional).
    """
    if not employee_id or finger_index is None:
        return {"success": False, "message": "Missing employeeId or fingerIndex"}

    # Check enrollment limit
    count = db.get_template_count(employee_id)
    if count >= MAX_TEMPLATES_PER_EMPLOYEE and finger_index not in (0, 1):
        return {"success": False, "message": f"Maximum {MAX_TEMPLATES_PER_EMPLOYEE} fingers enrolled"}

    # Check if this finger slot is already taken
    templates = db.get_templates(employee_id)
    existing = [t for t in templates if t["fingerIndex"] == finger_index]
    if existing:
        # Delete existing enrollment for this finger to re-enroll
        db.delete_template(existing[0]["id"])

    # Begin enrollment
    if not wb.enroll_begin():
        return {"success": False, "message": "Failed to begin enrollment. Ensure sensor is ready."}

    # Capture samples
    samples = 0
    max_samples = 20
    while samples < max_samples:
        ok, more = wb.enroll_capture()
        if not ok:
            wb.discard()
            return {"success": False, "message": "Capture failed. Try again."}
        samples += 1
        if not more:
            break

    # Commit
    success, guid = wb.enroll_commit()
    if not success or not guid:
        return {"success": False, "message": "Failed to commit enrollment."}

    # Store in DB
    try:
        template = db.insert_template(employee_id, finger_index, guid, quality=80)
        return {
            "success": True,
            "message": f"Finger {finger_index + 1} enrolled successfully",
            "template": {
                "id": template["id"],
                "fingerIndex": template["fingerIndex"],
                "quality": template["quality"],
                "createdAt": str(template["createdAt"]),
            },
        }
    except Exception as e:
        return {"success": False, "message": f"Database error: {e}"}
