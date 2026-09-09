"""MySQL database layer for fingerprint service.

Reads/writes biometrictemplate and employee tables directly.
Same connection params as Next.js (XAMPP MySQL).
"""
import mysql.connector
from mysql.connector import pooling
from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

_pool = pooling.MySQLConnectionPool(
    pool_name="fp_pool",
    pool_size=3,
    pool_reset_session=True,
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
)


def _conn():
    return _pool.get_connection()


def get_employee_by_template_guid(guid: str) -> dict | None:
    """Look up employee by biometric template GUID."""
    conn = _conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT e.id, e.employeeId, e.firstName, e.lastName, e.photoPath
            FROM biometrictemplate bt
            JOIN employee e ON e.id = bt.employeeId
            WHERE bt.templateData = %s AND e.status = 'ACTIVE'
            LIMIT 1
            """,
            (guid,),
        )
        return cur.fetchone()
    finally:
        conn.close()


def get_template_count(employee_id: str) -> int:
    """How many fingers are enrolled for this employee."""
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM biometrictemplate WHERE employeeId = %s",
            (employee_id,),
        )
        return cur.fetchone()[0]
    finally:
        conn.close()


def get_templates(employee_id: str) -> list[dict]:
    """List enrolled templates for an employee."""
    conn = _conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT id, fingerIndex, quality, createdAt FROM biometrictemplate WHERE employeeId = %s ORDER BY fingerIndex",
            (employee_id,),
        )
        return cur.fetchall()
    finally:
        conn.close()


def insert_template(employee_id: str, finger_index: int, guid: str, quality: int) -> dict:
    """Insert a new fingerprint template."""
    conn = _conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            INSERT INTO biometrictemplate (id, employeeId, fingerIndex, templateData, quality, createdAt, updatedAt)
            VALUES (UUID(), %s, %s, %s, %s, NOW(), NOW())
            """,
            (employee_id, finger_index, guid, quality),
        )
        conn.commit()
        cur.execute(
            "SELECT id, fingerIndex, quality, createdAt FROM biometrictemplate WHERE employeeId = %s AND fingerIndex = %s",
            (employee_id, finger_index),
        )
        return cur.fetchone()
    finally:
        conn.close()


def delete_template(template_id: str) -> bool:
    """Delete a fingerprint template by its ID."""
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM biometrictemplate WHERE id = %s", (template_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_all_templates(employee_id: str) -> int:
    """Delete all templates for an employee. Returns count deleted."""
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM biometrictemplate WHERE employeeId = %s", (employee_id,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()
