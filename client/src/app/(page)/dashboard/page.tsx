"use client"

import Navbar from "@/app/components/Navbar";
import DashBoard from "@/app/components/DashBoard";

export default function Dashboard() {
  return (
    <>
      {/* Use Navbar dropdown menu; no slide-over sidebar */}
      <Navbar extraMenuItems={[{ href: '/main/domains/archived', label: 'Archived Domains' }]} />
      <DashBoard />
    </>
  );
}
