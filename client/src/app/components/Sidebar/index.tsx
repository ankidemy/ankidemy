import Link from 'next/link';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className={`
          fixed inset-0 bg-black bg-opacity-50 z-40
          transition-opacity duration-300
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        className={`
          fixed top-0 right-0 h-full w-64 bg-white border-l border-gray-200 z-50
          transform transition-transform duration-300
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <div className="p-4 flex justify-end">
          <button onClick={onClose} className="p-2 text-gray-600 hover:text-gray-900">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none"
                 viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="px-4 space-y-4">
          <Link href="/profile/configure" className="block p-2 rounded hover:bg-gray-100">Configurar perfil</Link>
          <Link href="/profile/edit" className="block p-2 rounded hover:bg-gray-100">Editar perfil</Link>
          <Link href="/profile/security" className="block p-2 rounded hover:bg-gray-100">Seguridad</Link>
          <Link href="/profile/notifications" className="block p-2 rounded hover:bg-gray-100">Notificaciones</Link>
          <Link href="/logout" className="block p-2 rounded hover:bg-gray-100">Cerrar sesión</Link>
        </nav>
      </aside>
    </>
  );
}
