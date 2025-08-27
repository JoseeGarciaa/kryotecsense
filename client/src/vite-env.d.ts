/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />
/// <reference path="./types/global.d.ts" />

declare module 'lucide-react' {
  import { FC, SVGProps } from 'react';
  export interface LucideProps extends SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
  }
  
  export type LucideIcon = FC<LucideProps>;
  
  export const Plus: LucideIcon;
  export const Search: LucideIcon;
  export const Filter: LucideIcon;
  export const Loader: LucideIcon;
  export const Edit: LucideIcon;
  export const Trash2: LucideIcon;
  export const MoreHorizontal: LucideIcon;
  export const Clock: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const Play: LucideIcon;
  export const Pause: LucideIcon;
  export const Scan: LucideIcon;
  export const X: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const Package: LucideIcon;
  export const Wifi: LucideIcon;
  export const WifiOff: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Sun: LucideIcon;
  export const Moon: LucideIcon;
  export const Leaf: LucideIcon;
  export const Menu: LucideIcon;
  export const Home: LucideIcon;
  export const Activity: LucideIcon;
  export const Shield: LucideIcon;
  export const FileText: LucideIcon;
  export const LogOut: LucideIcon;
  export const User: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const Settings: LucideIcon;
  export const Bell: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const Maximize: LucideIcon;
  export const Minimize: LucideIcon;
  export const ClipboardList: LucideIcon;
}
