"""MySQL layer. Mirrors the Prisma schema (lowercase tables, camelCase columns)."""
import json
import secrets
from datetime import datetime

import mysql.connector

import config


def _connect():
    return mysql.connector.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
    )


def _new_id(prefix="fp"):
    return prefix + secrets.token_hex(12)


def check_connection():
    """Returns (ok, message)."""
    try:
        conn = _connect()
        conn.close()
        return True, "connected"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def count_templates(employee_pk):
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM biometrictemplate WHERE employeeId=%s",
            (employee_pk,),
        )
        return cur.fetchone()[0]
    finally:
        conn.close()


def find_owner_by_guid(guid):
    """Map a WinBio identity GUID (stored in templateData) to an employee."""
    conn = _connect()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """SELECT e.id, e.employeeId AS code, e.firstName, e.lastName
               FROM biometrictemplate b
               JOIN employee e ON e.id = b.employeeId
               WHERE b.templateData=%s AND e.active=1
               LIMIT 1""",
            (guid,),
        )
        return cur.fetchone()
    finally:
        conn.close()


def toggle_attendance(employee_pk):
    """First scan = clock in, second = clock out. Returns (action, time_str)."""
    now = datetime.now()
    conn = _connect()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """SELECT id, clockInAt, clockOutAt FROM attendance
               WHERE employeeId=%s AND date >= CURDATE()
                 AND date < CURDATE() + INTERVAL 1 DAY
               LIMIT 1""",
            (employee_pk,),
        )
        row = cur.fetchone()
        if row is None:
            day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            rec_id = _new_id("att")
            cur.execute(
                """INSERT INTO attendance
                   (id, employeeId, date, clockInAt, clockInOnPremise,
                    clockInDistance, biometricVerified, manuallyEdited,
                    createdAt, updatedAt)
                   VALUES (%s,%s,%s,%s,1,0,1,0,%s,%s)""",
                (rec_id, employee_pk, day_start, now, now, now),
            )
            conn.commit()
            _audit(cur, employee_pk, "Clock In", "Attendance", rec_id,
                   {"source": "fingerprint-kiosk"})
            conn.commit()
            return "clock_in", now.strftime("%I:%M %p")
        if row["clockOutAt"] is None:
            cur.execute(
                """UPDATE attendance SET clockOutAt=%s, clockOutOnPremise=1,
                   clockOutDistance=0, biometricVerified=1, updatedAt=%s
                   WHERE id=%s""",
                (now, now, row["id"]),
            )
            conn.commit()
            _audit(cur, employee_pk, "Clock Out", "Attendance", row["id"],
                   {"source": "fingerprint-kiosk"})
            conn.commit()
            return "clock_out", now.strftime("%I:%M %p")
        return "already_done", row["clockOutAt"].strftime("%I:%M %p")
    finally:
        conn.close()


def _audit(cur, user_id, action, entity, entity_id, metadata):
    cur.execute(
        """INSERT INTO auditlog
           (id, userId, action, entity, entityId, metadata, ipAddress, createdAt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (_new_id("aud"), user_id, action, entity, entity_id,
         json.dumps(metadata), "kiosk", datetime.now()),
    )
