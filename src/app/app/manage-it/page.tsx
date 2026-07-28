import ManageItCRMWorkspace from "@/components/ManageItCRMWorkspace";
import OrdersStatusBoard from "@/components/OrdersStatusBoard";
import OverseeSummaryPanel from "@/components/OverseeSummaryPanel";

export default function ManageItPage() {
  return (
    <div className="space-y-6">
      <OverseeSummaryPanel scope="admin" />
      <OrdersStatusBoard
        scope="admin"
        title="Admin Oversee it"
        subtitle="All merchants, all organisations, all orders, lifecycle states, Track-POD status, and invoice placeholders where present."
      />
      <ManageItCRMWorkspace />
    </div>
  );
}
