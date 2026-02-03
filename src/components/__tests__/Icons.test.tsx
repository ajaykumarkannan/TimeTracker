import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  PlayIcon,
  StopIcon,
  PauseIcon,
  ClockIcon,
  ListIcon,
  TagIcon,
  ChartIcon,
  LogoutIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  TrashIcon,
  EditIcon,
  CloudIcon,
  DatabaseIcon,
  SettingsIcon,
  MenuIcon,
  HelpIcon,
} from '../Icons';

describe('Icons', () => {
  const icons = [
    { name: 'PlayIcon', Component: PlayIcon },
    { name: 'StopIcon', Component: StopIcon },
    { name: 'PauseIcon', Component: PauseIcon },
    { name: 'ClockIcon', Component: ClockIcon },
    { name: 'ListIcon', Component: ListIcon },
    { name: 'TagIcon', Component: TagIcon },
    { name: 'ChartIcon', Component: ChartIcon },
    { name: 'LogoutIcon', Component: LogoutIcon },
    { name: 'SunIcon', Component: SunIcon },
    { name: 'MoonIcon', Component: MoonIcon },
    { name: 'MonitorIcon', Component: MonitorIcon },
    { name: 'TrashIcon', Component: TrashIcon },
    { name: 'EditIcon', Component: EditIcon },
    { name: 'CloudIcon', Component: CloudIcon },
    { name: 'DatabaseIcon', Component: DatabaseIcon },
    { name: 'SettingsIcon', Component: SettingsIcon },
    { name: 'MenuIcon', Component: MenuIcon },
    { name: 'HelpIcon', Component: HelpIcon },
  ];

  icons.forEach(({ name, Component }) => {
    it(`renders ${name} with default size`, () => {
      const { container } = render(<Component />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '16');
      expect(svg).toHaveAttribute('height', '16');
    });

    it(`renders ${name} with custom size`, () => {
      const { container } = render(<Component size={24} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
    });

    it(`renders ${name} with custom className`, () => {
      const { container } = render(<Component className="custom-class" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('custom-class');
    });
  });
});
