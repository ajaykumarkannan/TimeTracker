import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  ClockIcon,
  TagIcon,
  ChartIcon,
  LogoutIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  SettingsIcon,
  HelpIcon,
} from '../Icons';

describe('Icons', () => {
  const icons = [
    { name: 'ClockIcon', Component: ClockIcon },
    { name: 'TagIcon', Component: TagIcon },
    { name: 'ChartIcon', Component: ChartIcon },
    { name: 'LogoutIcon', Component: LogoutIcon },
    { name: 'SunIcon', Component: SunIcon },
    { name: 'MoonIcon', Component: MoonIcon },
    { name: 'MonitorIcon', Component: MonitorIcon },
    { name: 'SettingsIcon', Component: SettingsIcon },
    { name: 'HelpIcon', Component: HelpIcon },
  ];

  icons.forEach(({ name, Component }) => {
    it(`renders ${name} with expected props`, () => {
      const { container: defaultContainer } = render(<Component />);
      const defaultSvg = defaultContainer.querySelector('svg');
      expect(defaultSvg).toBeInTheDocument();
      expect(defaultSvg).toHaveAttribute('width', '16');
      expect(defaultSvg).toHaveAttribute('height', '16');

      const { container: sizedContainer } = render(<Component size={24} />);
      const sizedSvg = sizedContainer.querySelector('svg');
      expect(sizedSvg).toHaveAttribute('width', '24');
      expect(sizedSvg).toHaveAttribute('height', '24');

      const { container: classContainer } = render(<Component className="custom-class" />);
      const classSvg = classContainer.querySelector('svg');
      expect(classSvg).toHaveClass('custom-class');
    });
  });
});
