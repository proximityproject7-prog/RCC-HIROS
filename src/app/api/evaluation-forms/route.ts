import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireAuth,
  requirePermission,
} from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET   /api/evaluation-forms  auth            — list active forms
// POST  /api/evaluation-forms  evaluation.manage_forms — create form
//   Default 10 criteria across 5 categories × 2 each.
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CRITERIA: {
  category: string;
  description: string;
  maxScore?: number;
  weight?: number;
}[] = [
  // I. Communication Skills (4 items)
  { category: "I. Communication Skills", description: "Pronounces words clearly and distinctly." },
  { category: "I. Communication Skills", description: "Speaks clearly enough to be understood easily." },
  { category: "I. Communication Skills", description: "Has good command of English or Filipino." },
  { category: "I. Communication Skills", description: "Has a well-modulated voice." },
  // II. Instructional Skills (7 items)
  { category: "II. Instructional Skills", description: "Uses a variety of methods and techniques to facilitate learning." },
  { category: "II. Instructional Skills", description: "Presents the subject matter clearly and systematically." },
  { category: "II. Instructional Skills", description: "Adjusts to the students' learning pace without sacrificing completeness of the course." },
  { category: "II. Instructional Skills", description: "Provokes critical, creative, and reflective thinking." },
  { category: "II. Instructional Skills", description: "Encourages students' active participation in the discussions." },
  { category: "II. Instructional Skills", description: "Uses teaching aids/devices like illustrations, diagrams, etc." },
  { category: "II. Instructional Skills", description: "Elicits correct responses through skillful questioning." },
  // III. Knowledge of the Subject-Matter (5 items)
  { category: "III. Knowledge of the Subject-Matter", description: "Discusses the lesson with mastery." },
  { category: "III. Knowledge of the Subject-Matter", description: "Follows the course syllabus." },
  { category: "III. Knowledge of the Subject-Matter", description: "Relates subject matter to other subjects and to previous knowledge and experiences." },
  { category: "III. Knowledge of the Subject-Matter", description: "Relates subject matter to the vision, mission, and objectives of the college." },
  { category: "III. Knowledge of the Subject-Matter", description: "Integrates values in the lessons." },
  // IV. Classroom Management (6 items)
  { category: "IV. Classroom Management", description: "Maintains class discipline." },
  { category: "IV. Classroom Management", description: "Sees to it that the room is clean and orderly." },
  { category: "IV. Classroom Management", description: "Comes to class on time." },
  { category: "IV. Classroom Management", description: "Dismisses class on time." },
  { category: "IV. Classroom Management", description: "Is always present in class." },
  { category: "IV. Classroom Management", description: "Enforces school rules and regulations consistently." },
  // V. Professional Qualities (5 items)
  { category: "V. Professional Qualities", description: "Respects students' opinions." },
  { category: "V. Professional Qualities", description: "Maintains good working relations with students." },
  { category: "V. Professional Qualities", description: "Is fair in giving grades." },
  { category: "V. Professional Qualities", description: "Is firm and consistent - strict but reasonable in dealing with students." },
  { category: "V. Professional Qualities", description: "Returns corrected test papers and projects promptly." },
  // VI. Personal Qualities (3 items)
  { category: "VI. Personal Qualities", description: "Dresses neatly and appropriately." },
  { category: "VI. Personal Qualities", description: "Demonstrates calmness and poise." },
  { category: "VI. Personal Qualities", description: "Is physically and mentally fit to teach." },
  // VII. Classwork Design (For Online Classroom) (4 items)
  { category: "VII. Classwork Design (For Online Classroom)", description: "Presents an instructional plan/syllabus geared towards the attainment of learning outcomes." },
  { category: "VII. Classwork Design (For Online Classroom)", description: "Uses modules to organize classwork content." },
  { category: "VII. Classwork Design (For Online Classroom)", description: "Provides equal access of learning materials to all students." },
  { category: "VII. Classwork Design (For Online Classroom)", description: "Organizes assignments, activities and related due dates." },
];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") || "active";

    const forms = await db.evaluationForm.findMany({
      where: scope === "all" ? {} : { active: true },
      include: {
        _count: {
          select: { criteria: true, periods: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      forms: forms.map((f) => ({
        id: f.id,
        name: f.name,
        version: f.version,
        active: f.active,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        criteriaCount: f._count.criteria,
        periodsCount: f._count.periods,
      })),
    });
  } catch (error) {
    console.error("[API /evaluation-forms GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "evaluation.manage_forms");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, criteria } = body as {
      name?: string;
      criteria?: { category: string; description: string; maxScore?: number; weight?: number }[];
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Form name is required" },
        { status: 400 }
      );
    }

    const dup = await db.evaluationForm.findFirst({
      where: { name: name.trim().toLowerCase() },
    });
    if (dup) {
      return NextResponse.json(
        { error: "Form with this name already exists" },
        { status: 409 }
      );
    }

    const useCriteria =
      Array.isArray(criteria) && criteria.length > 0
        ? criteria
        : DEFAULT_CRITERIA;

    const form = await db.evaluationForm.create({
      data: {
        name: name.trim(),
        active: true,
        criteria: {
          create: useCriteria.map((c, idx) => ({
            category: c.category,
            description: c.description,
            maxScore: typeof c.maxScore === "number" ? c.maxScore : 5,
            weight: typeof c.weight === "number" ? c.weight : 1.0,
            sortOrder: idx,
          })),
        },
      },
      include: {
        criteria: { orderBy: { sortOrder: "asc" } },
        _count: { select: { periods: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Create Evaluation Form",
        entity: "EvaluationForm",
        entityId: form.id,
        metadata: JSON.stringify({
          name: form.name,
          criteriaCount: form.criteria.length,
        }),
      },
    });

    return NextResponse.json(
      {
        form: {
          id: form.id,
          name: form.name,
          version: form.version,
          active: form.active,
          createdAt: form.createdAt.toISOString(),
          updatedAt: form.updatedAt.toISOString(),
          criteria: form.criteria.map((c) => ({
            id: c.id,
            category: c.category,
            description: c.description,
            maxScore: c.maxScore,
            weight: c.weight,
            sortOrder: c.sortOrder,
          })),
          periodsCount: form._count.periods,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API /evaluation-forms POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
