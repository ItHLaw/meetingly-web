import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { UIState, Notification } from '@/types';

interface UIStore extends UIState {
  // Theme actions
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  
  // Sidebar actions
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  
  // Notification actions
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  
  // Modal actions
  setModal: (modal: keyof UIState['modals'], open: boolean) => void;
  openModal: (modal: keyof UIState['modals']) => void;
  closeModal: (modal: keyof UIState['modals']) => void;
  closeAllModals: () => void;
  
  // Utility actions
  reset: () => void;
}

const initialState: UIState = {
  theme: 'light',
  sidebarOpen: true,
  notifications: [],
  modals: {
    settings: false,
    upload: false,
    delete: false,
  },
};

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Theme actions
        setTheme: (theme) => {
          set({ theme }, false, 'ui/setTheme');
          
          // Apply to document
          if (typeof window !== 'undefined') {
            document.documentElement.classList.toggle('dark', theme === 'dark');
          }
        },

        toggleTheme: () => {
          const { theme } = get();
          const newTheme = theme === 'light' ? 'dark' : 'light';
          get().setTheme(newTheme);
        },

        // Sidebar actions
        setSidebarOpen: (open) => {
          set({ sidebarOpen: open }, false, 'ui/setSidebarOpen');
        },

        toggleSidebar: () => {
          const { sidebarOpen } = get();
          set({ sidebarOpen: !sidebarOpen }, false, 'ui/toggleSidebar');
        },

        // Notification actions
        addNotification: (notificationData) => {
          const notification: Notification = {
            id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...notificationData,
          };

          const { notifications } = get();
          set({ 
            notifications: [...notifications, notification] 
          }, false, 'ui/addNotification');

          // Auto-remove after duration (if specified)
          if (notification.duration && notification.duration > 0) {
            setTimeout(() => {
              get().removeNotification(notification.id);
            }, notification.duration);
          }
        },

        removeNotification: (id) => {
          const { notifications } = get();
          set({ 
            notifications: notifications.filter(n => n.id !== id) 
          }, false, 'ui/removeNotification');
        },

        clearNotifications: () => {
          set({ notifications: [] }, false, 'ui/clearNotifications');
        },

        // Modal actions
        setModal: (modal, open) => {
          const { modals } = get();
          set({ 
            modals: { ...modals, [modal]: open } 
          }, false, 'ui/setModal');
        },

        openModal: (modal) => {
          get().setModal(modal, true);
        },

        closeModal: (modal) => {
          get().setModal(modal, false);
        },

        closeAllModals: () => {
          set({ 
            modals: {
              settings: false,
              upload: false,
              delete: false,
            }
          }, false, 'ui/closeAllModals');
        },

        // Utility actions
        reset: () => {
          set(initialState, false, 'ui/reset');
        },
      }),
      {
        name: 'ui-store',
        // Persist theme and sidebar preferences
        partialize: (state) => ({
          theme: state.theme,
          sidebarOpen: state.sidebarOpen,
        }),
      }
    ),
    { name: 'UIStore' }
  )
);

// Initialize theme on load
if (typeof window !== 'undefined') {
  const store = useUIStore.getState();
  document.documentElement.classList.toggle('dark', store.theme === 'dark');
}