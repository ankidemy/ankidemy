"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { Menu } from 'lucide-react';

interface LeftPanelToggleProps {
  onClick: () => void;
}

const LeftPanelToggle: React.FC<LeftPanelToggleProps> = ({ onClick }) => {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="absolute left-3 top-3 z-30 bg-white shadow-md rounded-full h-9 w-9"
      title="Show Browser"
    >
      <Menu size={18} />
    </Button>
  );
};

export default LeftPanelToggle;
