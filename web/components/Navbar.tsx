'use client';

import React from 'react';
import { Home, Flame, Plus, Gavel, User, Sparkles } from 'lucide-react';

export type TabType = 'home' | 'feed' | 'create' | 'auctions' | 'qwen' | 'profile';

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prominent?: boolean;
}

interface NavbarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export default function Navbar({ currentTab, onSelectTab }: NavbarProps) {
  const items: NavItem[] = [
    { id: 'home', label: 'Início', icon: Home },
    { id: 'feed', label: 'Feed', icon: Flame },
    { id: 'create', label: 'Criar', icon: Plus, prominent: true },
    { id: 'qwen', label: 'Qwen', icon: Sparkles },
    { id: 'auctions', label: 'Leilões', icon: Gavel },
    { id: 'profile', label: 'Perfil', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200">
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          if (item.prominent) {
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className="flex flex-col items-center justify-center -mt-4 group"
              >
                <div className="w-12 h-12 rounded-full bg-[#00A86B] text-white flex items-center justify-center shadow-lg transform transition active:scale-95 group-hover:bg-[#046A4E]">
                  <Plus className="w-6 h-6 stroke-[2.5]" />
                </div>
                <span className="text-[11px] font-bold text-[#00A86B] mt-1">{item.label}</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 transition ${
                isActive ? 'text-[#00A86B] font-bold' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              <span className="text-[10px] mt-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
