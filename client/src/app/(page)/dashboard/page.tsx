"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
    const router = useRouter();

  // Funcion para hacer log out
  const handleLogout = () => {
    console.log('Logged out');
    router.push('/');
  };

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
        <h2 className="text-3xl font-semibold mb-4">Bienvenido al Dashboard de Ankidemy</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded shadow">
            <h3 className="text-lg font-bold">Crear</h3>
            <p className="text-sm">Crea temarios y ejercicios a tu gusto</p>
          </div>
          <div className="bg-white p-6 rounded shadow">
            <h3 className="text-lg font-bold">Estudiar</h3>
            <p className="text-sm">Estudia los temas matematicos </p>
          </div>
          <div className="bg-white p-6 rounded shadow">
            <h3 className="text-lg font-bold">Comparte</h3>
            <p className="text-sm">Comparte con los demas tu contenido</p>
          </div>
        </div>
      </main>
    </div>
  );
}