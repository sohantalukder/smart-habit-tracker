import { create } from 'zustand';
import type { AppState } from './slices/appSlice';
import { createAppSlice } from './slices/appSlice';

export type StoreState = AppState;

export const useStore = create<StoreState>()((...a) => ({
  ...createAppSlice(...a),
}));
