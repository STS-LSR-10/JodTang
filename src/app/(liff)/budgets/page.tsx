import { EmptyState, PageHeader } from "@/components/liff/states";

export default function BudgetsPage() {
  return (
    <main>
      <PageHeader title="หมวด/งบ" />
      <EmptyState
        mood="thinking"
        title="กำลังจะมาเร็ว ๆ นี้"
        hint="การจัดการหมวดหมู่และตั้งงบกำลังเตรียมอยู่นะ"
      />
    </main>
  );
}
