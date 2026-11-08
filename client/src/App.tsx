import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { RequireRole } from './lib/auth';
import { Home, Login, ChangePassword, Verify, NotFound } from './pages/Public';
const StudentLayout = lazy(() => import('./pages/student/Layout').then((m) => ({ default: m.StudentLayout })));
const StudentHome = lazy(() => import('./pages/student/Home').then((m) => ({ default: m.StudentHome })));
const JourneyMap = lazy(() => import('./pages/student/Journey').then((m) => ({ default: m.JourneyMap })));
const StagePlay = lazy(() => import('./pages/student/StagePlay').then((m) => ({ default: m.StagePlay })));
const Catalog = lazy(() => import('./pages/student/Courses').then((m) => ({ default: m.Catalog })));
const CourseDetail = lazy(() => import('./pages/student/Courses').then((m) => ({ default: m.CourseDetail })));
const MyCourses = lazy(() => import('./pages/student/Courses').then((m) => ({ default: m.MyCourses })));
const CoursePlayer = lazy(() => import('./pages/student/Courses').then((m) => ({ default: m.CoursePlayer })));
const AssessmentTake = lazy(() => import('./pages/student/Courses').then((m) => ({ default: m.AssessmentTake })));
const AttemptResult = lazy(() => import('./pages/student/Courses').then((m) => ({ default: m.AttemptResult })));
const Achievements = lazy(() => import('./pages/student/Profile').then((m) => ({ default: m.Achievements })));
const Certificates = lazy(() => import('./pages/student/Profile').then((m) => ({ default: m.Certificates })));
const CertificatePage = lazy(() => import('./pages/student/Profile').then((m) => ({ default: m.CertificatePage })));
const StudentProfile = lazy(() => import('./pages/student/Profile').then((m) => ({ default: m.StudentProfile })));
const StudentNotifications = lazy(() => import('./pages/student/Profile').then((m) => ({ default: m.StudentNotifications })));
const TeacherLayout = lazy(() => import('./pages/teacher/Layout').then((m) => ({ default: m.TeacherLayout })));
const TeacherDashboard = lazy(() => import('./pages/teacher/Dashboard').then((m) => ({ default: m.TeacherDashboard })));
const Students = lazy(() => import('./pages/teacher/Students').then((m) => ({ default: m.Students })));
const StudentFile = lazy(() => import('./pages/teacher/Students').then((m) => ({ default: m.StudentFile })));
const JourneyOverview = lazy(() => import('./pages/teacher/Journey').then((m) => ({ default: m.JourneyOverview })));
const StagesManagement = lazy(() => import('./pages/teacher/Journey').then((m) => ({ default: m.StagesManagement })));
const ProgressMatrix = lazy(() => import('./pages/teacher/Journey').then((m) => ({ default: m.ProgressMatrix })));
const CoursesList = lazy(() => import('./pages/teacher/Courses').then((m) => ({ default: m.CoursesList })));
const CourseBuilder = lazy(() => import('./pages/teacher/Courses').then((m) => ({ default: m.CourseBuilder })));
const Assessments = lazy(() => import('./pages/teacher/Assessments').then((m) => ({ default: m.Assessments })));
const CertificatesAdmin = lazy(() => import('./pages/teacher/Admin').then((m) => ({ default: m.CertificatesAdmin })));
const Reports = lazy(() => import('./pages/teacher/Admin').then((m) => ({ default: m.Reports })));
const SettingsPage = lazy(() => import('./pages/teacher/Admin').then((m) => ({ default: m.SettingsPage })));
const TeacherNotifications = lazy(() => import('./pages/teacher/Admin').then((m) => ({ default: m.TeacherNotifications })));

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-400">جارٍ التحميل…</div>}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/verify/:serial" element={<Verify />} />

      <Route path="/student" element={<RequireRole role="student"><StudentLayout /></RequireRole>}>
        <Route index element={<StudentHome />} />
        <Route path="journey" element={<JourneyMap />} />
        <Route path="journey/:id" element={<StagePlay />} />
        <Route path="courses" element={<Catalog />} />
        <Route path="courses/:id" element={<CourseDetail />} />
        <Route path="courses/:id/learn" element={<CoursePlayer />} />
        <Route path="assessments/:id" element={<AssessmentTake />} />
        <Route path="attempts/:id" element={<AttemptResult />} />
        <Route path="my-courses" element={<MyCourses />} />
        <Route path="achievements" element={<Achievements />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="certificates/:id" element={<CertificatePage />} />
        <Route path="profile" element={<StudentProfile />} />
        <Route path="notifications" element={<StudentNotifications />} />
      </Route>

      <Route path="/teacher" element={<RequireRole role="teacher"><TeacherLayout /></RequireRole>}>
        <Route index element={<TeacherDashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentFile />} />
        <Route path="journey" element={<JourneyOverview />} />
        <Route path="stages" element={<StagesManagement />} />
        <Route path="progress" element={<ProgressMatrix />} />
        <Route path="courses" element={<CoursesList />} />
        <Route path="courses/:id" element={<CourseBuilder />} />
        <Route path="content" element={<CoursesList contentMode />} />
        <Route path="assessments" element={<Assessments />} />
        <Route path="certificates" element={<CertificatesAdmin />} />
        <Route path="certificates/:id" element={<CertificatePage dark={false} />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="notifications" element={<TeacherNotifications />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}
