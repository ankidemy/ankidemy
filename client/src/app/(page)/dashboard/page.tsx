"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { logout, getCurrentUser, getMyDomains, getEnrolledDomains, User, Domain } from "@/lib/api";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownedDomains, setOwnedDomains] = useState<Domain[]>([]);
  const [enrolledDomains, setEnrolledDomains] = useState<Domain[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch current user data
        const userData = await getCurrentUser();
        setUser(userData);
        
        // Fetch domains created by the user
        const myDomains = await getMyDomains();
        setOwnedDomains(myDomains);
        
        // Fetch domains the user is enrolled in
        const enrolled = await getEnrolledDomains();
        setEnrolledDomains(enrolled);
      } catch (err: any) {
        console.error("Error fetching dashboard data:", err);
        setError("Failed to load your data. Please try logging in again.");
        
        // Redirect to login if unauthorized
        if (err.message?.includes("unauthorized") || err.message?.includes("token")) {
          router.push("/login");
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [router]);

  // Function to handle logout
  const handleLogout = () => {
    logout();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-red-500 text-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-64 bg-orange-100 text-orange-800 flex flex-col p-4">
        <Image
          src="/img/logo.png"
          alt="Logo"
          width={130} 
          height={32} 
        />
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <nav className="flex-1">
          <ul>
            <li>
              <Link href="/dashboard" className="block py-2 px-4 hover:bg-orange-400 rounded">
                Home
              </Link>
            </li>
            <li>
              <Link href="/dashboard/profile" className="block py-2 px-4 hover:bg-orange-400 rounded">
                Profile
              </Link>
            </li>
            <li>
              <Link href="/graph" className="block py-2 px-4 hover:bg-orange-400 rounded">
                Knowledge Graphs
              </Link>
            </li>
            <li>
              <Link href="/dashboard/settings" className="block py-2 px-4 hover:bg-orange-400 rounded">
                Settings
              </Link>
            </li>
          </ul>
        </nav>
        <button
          onClick={handleLogout}
          className="py-2 px-4 text-white bg-orange-500 hover:bg-orange-400 rounded text-center mt-4"
        >
          Log Out
        </button>
      </aside>

      <main className="flex-1 p-6">
        <h2 className="text-3xl font-semibold mb-4">
          {user ? `Welcome, ${user.firstName || user.username}!` : 'Welcome to Ankidemy'}
        </h2>
        
        {/* Your Domains Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-medium">Your Domains</h3>
            <Link 
              href="/dashboard/domains/create" 
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-400"
            >
              Create New Domain
            </Link>
          </div>
          
          {ownedDomains.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ownedDomains.map(domain => (
                <div key={domain.id} className="bg-white p-6 rounded shadow">
                  <h4 className="text-lg font-bold">{domain.name}</h4>
                  <p className="text-sm text-gray-600">{domain.description || 'No description'}</p>
                  <div className="mt-4 flex justify-between">
                    <Link 
                      href={`/graph?domainId=${domain.id}`}
                      className="text-orange-500 hover:underline"
                    >
                      View Graph
                    </Link>
                    <Link 
                      href={`/dashboard/domains/${domain.id}/edit`}
                      className="text-blue-500 hover:underline"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-6 rounded shadow">
              <p>You haven't created any domains yet. Create your first domain to get started!</p>
            </div>
          )}
        </div>
        
        {/* Enrolled Domains Section */}
        <div>
          <h3 className="text-xl font-medium mb-4">Enrolled Domains</h3>
          
          {enrolledDomains.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {enrolledDomains.map(domain => (
                <div key={domain.id} className="bg-white p-6 rounded shadow">
                  <h4 className="text-lg font-bold">{domain.name}</h4>
                  <p className="text-sm text-gray-600">{domain.description || 'No description'}</p>
                  <div className="mt-4 flex justify-between">
                    <Link 
                      href={`/graph?domainId=${domain.id}`}
                      className="text-orange-500 hover:underline"
                    >
                      View Graph
                    </Link>
                    <Link 
                      href={`/dashboard/domains/${domain.id}/study`}
                      className="text-green-500 hover:underline"
                    >
                      Study
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-6 rounded shadow">
              <p>You're not enrolled in any domains. Explore public domains to find something to study!</p>
              <Link 
                href="/dashboard/domains/explore"
                className="mt-4 inline-block px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-400"
              >
                Explore Domains
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
