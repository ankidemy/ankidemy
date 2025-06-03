"use client"

import ProtectedRoute from "@/app/components/ProtectedRoute";
import { useState } from 'react'
import Layout from "@/app/layout";
import Navbar from "@/app/components/Navbar";
import DashBoard from "@/app/components/DashBoard";
import Sidebar from "@/app/components/Sidebar";

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const openSidebar = () => setSidebarOpen(true)
  const closeSidebar = () => setSidebarOpen(false)
  
  return (
    <ProtectedRoute>
      <Layout>
        <Navbar onMenuClick={openSidebar} />
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
        <DashBoard />
      </Layout>
    </ProtectedRoute> 
  );
}