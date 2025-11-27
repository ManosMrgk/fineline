import DashboardClient from "@/components/dashboard/dashboard-client";
import { Suspense } from "react";
import Loading from "./loading";

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardClient />
    </Suspense>
  );
}
