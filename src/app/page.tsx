"use client";

import { useAuth } from "@/hooks/use-auth";
import { useAuthStore } from "@/store/auth-store";
import LoginPage from "@/components/login-page";
import ChangePasswordModal from "@/components/shared/change-password-modal";
import AppLayout from "@/components/shared/app-layout";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { PermissionDenied } from "@/components/shared/permission-denied";
import { DynamicDashboard } from "@/components/shared/dashboard";
import { useEffect, useState } from "react";

import { EmployeeListPage, EmployeeFormPage, EmployeeProfilePage } from "@/components/profiling/employee-pages";
import { AttendanceListPage, PremisesSettingsPage } from "@/components/attendance/attendance-pages";
import { LeavePage } from "@/components/leave/leave-pages";
import { EvaluationPage } from "@/components/evaluation/evaluation-pages";
import { ReportsPage } from "@/components/reports/report-pages";
import { RoleListPage, RoleFormPage } from "@/components/admin/role-pages";
import { GroupListPage, GroupFormPage } from "@/components/admin/group-pages";
import { FpassPage } from "@/components/fpass/fpass-pages";

export default function HomePage() {
  const { user, isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const { currentPage, currentSubpage } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Don't render anything on SSR — prevents hydration mismatch
  if (!mounted) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rcc-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rcc-primary border-t-transparent" />
          <p className="text-sm text-rcc-text-muted">Loading session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) return <LoginPage />;
  if (mustChangePassword) return <ChangePasswordModal />;

  let content: React.ReactNode;
  switch (currentPage) {
    case "dashboard": content = <DynamicDashboard />; break;
    case "profiling":
      content = currentSubpage === "myprofile" ? (
        user?.id ? <EmployeeProfilePage employeeId={user.id} /> : <PermissionDenied />
      ) : (
        <PermissionGuard require="profiling.view" fallback={<PermissionDenied />}>
          {currentSubpage === "create" ? (
            <PermissionGuard require="profiling.create" fallback={<PermissionDenied />}><EmployeeFormPage mode="create" /></PermissionGuard>
          ) : currentSubpage?.startsWith("edit:") ? (
            <PermissionGuard require="profiling.edit" fallback={<PermissionDenied />}><EmployeeFormPage mode="edit" employeeId={currentSubpage.slice(5)} /></PermissionGuard>
          ) : currentSubpage?.startsWith("view:") ? (
            <EmployeeProfilePage employeeId={currentSubpage.slice(5)} />
          ) : <EmployeeListPage />}
        </PermissionGuard>
      ); break;
    case "attendance":
      content = currentSubpage === "premises" ? (
        <PermissionGuard any={["attendance.edit", "roles.edit"]} fallback={<PermissionDenied />}><PremisesSettingsPage /></PermissionGuard>
      ) : (
        <PermissionGuard require="attendance.view" fallback={<PermissionDenied />}><AttendanceListPage /></PermissionGuard>
      ); break;
    case "leave":
      content = (
        <PermissionGuard any={["leave.request", "leave.approve_l1", "leave.approve_l2", "leave.view_all", "leave.manage_types"]} fallback={<PermissionDenied />}>
          <LeavePage />
        </PermissionGuard>
      ); break;
    case "evaluation":
      content = (
        <PermissionGuard any={["evaluation.view", "evaluation.view_results", "evaluation.submit", "evaluation.manage_forms"]} fallback={<PermissionDenied />}>
          <EvaluationPage />
        </PermissionGuard>
      ); break;
    case "reports":
      content = <PermissionGuard require="reports.view" fallback={<PermissionDenied />}><ReportsPage /></PermissionGuard>; break;
    case "roles":
      content = (
        <PermissionGuard require="roles.view" fallback={<PermissionDenied />}>
          {currentSubpage === "create" ? (
            <PermissionGuard require="roles.create" fallback={<PermissionDenied />}><RoleFormPage mode="create" /></PermissionGuard>
          ) : currentSubpage?.startsWith("edit:") ? (
            <PermissionGuard require="roles.edit" fallback={<PermissionDenied />}><RoleFormPage mode="edit" roleId={currentSubpage.slice(5)} /></PermissionGuard>
          ) : <RoleListPage />}
        </PermissionGuard>
      ); break;
    case "groups":
      content = (
        <PermissionGuard require="groups.view" fallback={<PermissionDenied />}>
          {currentSubpage === "create" ? (
            <PermissionGuard require="groups.manage" fallback={<PermissionDenied />}><GroupFormPage mode="create" /></PermissionGuard>
          ) : currentSubpage?.startsWith("edit:") ? (
            <PermissionGuard require="groups.manage" fallback={<PermissionDenied />}><GroupFormPage mode="edit" groupId={currentSubpage.slice(5)} /></PermissionGuard>
          ) : <GroupListPage />}
        </PermissionGuard>
      ); break;
    case "fpass":
      content = currentSubpage === "settings" ? (
        <PermissionGuard require="fpass.manage" fallback={<PermissionDenied />}>
          <FpassPage showSettings />
        </PermissionGuard>
      ) : (
        <PermissionGuard any={["fpass.fill", "fpass.manage"]} fallback={<PermissionDenied />}>
          <FpassPage
            employeeId={currentSubpage?.startsWith("emp:") ? currentSubpage.slice(4) : undefined}
            submissionId={currentSubpage?.startsWith("view:") ? currentSubpage.slice(5) : undefined}
          />
        </PermissionGuard>
      ); break;
    default: content = <DynamicDashboard />;
  }

  return <AppLayout>{content}</AppLayout>;
}
