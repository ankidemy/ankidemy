"use client";

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout, User } from '@/lib/api';

interface NavbarProps {
  currentUser?: User | null; 
}

const Navbar: React.FC<NavbarProps> = ({ currentUser }) => {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Error cerrando sesión:', error);
    }
  };

  return (
    <nav className="bg-white shadow-sm border-b fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/dashboard" className="text-2xl font-bold text-orange-500 hover:text-orange-600 transition-colors">
              Ankidemy
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link 
              href="/blog" 
              className="text-gray-600 hover:text-orange-500 transition-colors font-medium"
            >
              Blog
            </Link>
            <Link 
              href="/main" 
              className="text-gray-600 hover:text-orange-500 transition-colors font-medium"
            >
              Dominios
            </Link>
          </div>

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="relative group"
              aria-label="Abrir menú"
            >
              <div className="flex flex-col justify-center items-end w-8 h-8 space-y-1">
                <span className="w-full h-0.5 bg-gray-800 group-hover:bg-orange-500 transition-all duration-200" />
                <span className="w-2/3 h-0.5 bg-gray-800 group-hover:bg-orange-500 transition-all duration-200" />
                <span className="w-full h-0.5 bg-gray-800 group-hover:bg-orange-500 transition-all duration-200" />
              </div>
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl border z-50">
                <div className="py-2">
                  {currentUser && (
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm text-gray-500">Bienvenido,</p>
                      <p className="text-sm font-medium text-gray-900 truncate">{currentUser.username || 'Usuario'}</p>
                    </div>
                  )}
                  
                  <ul className="py-2 text-sm text-gray-800">
                    <li>
                      <Link 
                        href="/profile"
                        className="block px-4 py-2 hover:bg-orange-50 hover:text-orange-600 transition-colors rounded-md mx-2"
                        onClick={() => setShowMenu(false)}
                      >
                        Profile
                      </Link>
                    </li>
                    <li>
                      <Link 
                        href="/settings"
                        className="block px-4 py-2 hover:bg-orange-50 hover:text-orange-600 transition-colors rounded-md mx-2"
                        onClick={() => setShowMenu(false)}
                      > 
                        Settings 
                      </Link>
                    </li>
                    <li className="border-t border-gray-100 mt-2 pt-2">
                      <button 
                        onClick={() => {
                          setShowMenu(false);
                          handleLogout();
                        }}
                        className="w-full text-left block px-4 py-2 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors rounded-md mx-2"
                      >
                        Logout
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
