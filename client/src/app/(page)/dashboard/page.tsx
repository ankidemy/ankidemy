"use client"

import { useState } from 'react'
import Navbar from "@/app/components/Navbar";
import DashBoard from "@/app/components/DashBoard";
import Sidebar from "@/app/components/Sidebar";

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const openSidebar = () => setSidebarOpen(true)
  const closeSidebar = () => setSidebarOpen(false)
  
  return (
    <>
      <Navbar onMenuClick={openSidebar} />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <DashBoard />
    </>
  );
}
