import { EmptyState, PageHeader } from "@/components/liff/states";

export default function AnalyticsPage() {
  return (
    <main>
      <PageHeader title="วิเคราะห์" />
      <EmptyState
        mood="thinking"
        title="กำลังจะมาเร็ว ๆ นี้"
        hint="กราฟรายรับรายจ่ายและสัดส่วนตามหมวดกำลังเตรียมอยู่นะ"
      />
    </main>
  );
}
