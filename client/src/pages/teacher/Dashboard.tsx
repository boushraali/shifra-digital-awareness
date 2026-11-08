import { Link } from 'react-router-dom';
import { Users, UserCheck, Map, Flag, BookOpen, ClipboardList, Award, Percent, AlertCircle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { api } from '../../lib/api';
import { useLoad, Spinner, ErrorBox, StatCard, Card, PageHeader, Badge } from '../../lib/ui';
import { fmtShort, relTime } from '../../lib/format';
import { CERT_KIND } from '../../components/Certificate';

export const CHART = { a: '#6422f7', b: '#06b6d4', c: '#f59e0b', grid: '#e2e8f0', text: '#64748b' };
export const tick = { fill: CHART.text, fontSize: 12, fontFamily: 'IBM Plex Sans Arabic' };
export const tooltipStyle = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontFamily: 'IBM Plex Sans Arabic', direction: 'rtl' as const } };

export function TeacherDashboard() {
  const { data, loading, error, reload } = useLoad(() => api.get('/teacher/dashboard'));
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const k = data.kpi;
  return (
    <div className="space-y-6">
      <PageHeader title="الرئيسية" subtitle="نظرة عامة محدّثة من بيانات المنصة الفعلية" />
      {k.pending_grading > 0 && (
        <Link to="/teacher/assessments?tab=grading" className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
          <AlertCircle size={20} />لديك <b>{k.pending_grading}</b> محاولة اختبار بانتظار التصحيح اليدوي<span className="ms-auto font-semibold">انتقلي للتصحيح ←</span>
        </Link>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="إجمالي الطالبات المسجلات" value={k.students} icon={<Users />} />
        <StatCard label="الطالبات النشطات (14 يومًا)" value={k.active} icon={<UserCheck />} tone="green" />
        <StatCard label="بدأن رحلة الوعي الرقمي" value={k.journey_started} icon={<Map />} tone="sky" />
        <StatCard label="أكملن الرحلة كاملة" value={k.journey_completed} icon={<Flag />} tone="amber" />
        <StatCard label="الدورات المنشورة" value={k.courses_published} icon={<BookOpen />} tone="slate" />
        <StatCard label="التسجيلات في الدورات" value={k.enrollments} icon={<ClipboardList />} tone="sky" />
        <StatCard label="الشهادات الصادرة" value={k.certificates} icon={<Award />} tone="amber" />
        <StatCard label="متوسط نسبة إنجاز الرحلة" value={`${k.avg_journey_pct ?? 0}%`} icon={<Percent />} tone="green" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-bold text-slate-900">تقدم الطالبات في مراحل الرحلة</h2>
          <div className="h-72" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={data.perStage.map((s: any) => ({ name: `${s.id}`, title: s.title, 'مكتملة': s.completed, 'قيد التقدم': s.in_progress }))}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="name" tick={tick} label={{ value: 'المرحلة', position: 'insideBottom', offset: -2, ...tick }} />
                <YAxis allowDecimals={false} tick={tick} width={30} />
                <Tooltip {...tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.title} />
                <Legend wrapperStyle={{ fontFamily: 'IBM Plex Sans Arabic', fontSize: 12 }} />
                <Bar dataKey="مكتملة" stackId="a" fill={CHART.a} radius={[0, 0, 0, 0]} />
                <Bar dataKey="قيد التقدم" stackId="a" fill={CHART.b} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-bold text-slate-900">الدورات: التسجيل والإكمال</h2>
          {!data.perCourse.length ? <div className="grid h-72 place-items-center text-sm text-slate-400">لا توجد دورات منشورة بعد</div> : (
            <div className="h-72" dir="ltr">
              <ResponsiveContainer>
                <BarChart data={data.perCourse.map((c: any) => ({ name: c.title, 'المسجلات': c.enrolled, 'المكتملات': c.completed }))} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid horizontal={false} stroke={CHART.grid} />
                  <XAxis type="number" allowDecimals={false} tick={tick} />
                  <YAxis type="category" dataKey="name" width={150} tick={tick} orientation="right" />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontFamily: 'IBM Plex Sans Arabic', fontSize: 12 }} />
                  <Bar dataKey="المسجلات" fill={CHART.b} radius={[0, 6, 6, 0]} />
                  <Bar dataKey="المكتملات" fill={CHART.a} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-bold text-slate-900">النشاط خلال 14 يومًا</h2>
          <div className="h-60" dir="ltr">
            <ResponsiveContainer>
              <AreaChart data={data.activity.map((d: any) => ({ day: fmtShort(d.day), 'محاولات المراحل': d.stage_attempts, 'دروس مكتملة': d.lessons }))}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="day" tick={tick} interval={1} />
                <YAxis allowDecimals={false} tick={tick} width={30} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontFamily: 'IBM Plex Sans Arabic', fontSize: 12 }} />
                <Area type="monotone" dataKey="محاولات المراحل" stroke={CHART.a} fill={CHART.a} fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="دروس مكتملة" stroke={CHART.b} fill={CHART.b} fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-slate-900">أحدث الشهادات الصادرة</h2><Link to="/teacher/certificates" className="text-sm font-semibold text-nova-600">الكل</Link></div>
          {!data.recent.length ? <div className="py-10 text-center text-sm text-slate-400">لم تصدر شهادات بعد</div> : (
            <ul className="divide-y divide-slate-100">
              {data.recent.map((c: any, i: number) => (
                <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                  <Award size={18} className="text-amber-500" />
                  <div className="min-w-0 flex-1"><div className="font-medium text-slate-800">{c.student_name}</div><div className="truncate text-xs text-slate-500">{c.title}</div></div>
                  <Badge color={c.kind === 'course' ? 'blue' : c.kind === 'journey' ? 'amber' : 'violet'}>{CERT_KIND[c.kind].replace('شهادة ', '')}</Badge>
                  <span className="text-xs text-slate-400">{relTime(c.issued_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
