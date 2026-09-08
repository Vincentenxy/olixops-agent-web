import { Button } from 'antd';
import type { ReactNode } from 'react';

export function IconButton({
  label,
  icon,
  onClick,
  loading = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <Button
      className="icon-button"
      shape="circle"
      aria-label={label}
      icon={icon}
      onClick={onClick}
      loading={loading}
    />
  );
}
