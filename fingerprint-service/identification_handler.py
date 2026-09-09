"""Identification handler — matches fingerprint to employee.

Flow:
1. winbio_api.identify() → returns GUID
2. database.get_employee_by_template_guid(guid) → returns employee
3. Return employee info (or not_found)
"""
import winbio_api as wb
import database as db


def handle_identify() -> dict:
    """Identify a fingerprint and return employee info.

    Returns dict with keys: success, employee (optional), message.
    """
    guid = wb.identify()
    if not guid:
        return {"success": False, "message": "Fingerprint not recognized"}

    employee = db.get_employee_by_template_guid(guid)
    if not employee:
        return {"success": False, "message": "Fingerprint not recognized"}

    return {
        "success": True,
        "message": "Identified",
        "employee": {
            "id": employee["id"],
            "employeeId": employee["employeeId"],
            "firstName": employee["firstName"],
            "lastName": employee["lastName"],
            "photoPath": employee.get("photoPath"),
        },
    }
