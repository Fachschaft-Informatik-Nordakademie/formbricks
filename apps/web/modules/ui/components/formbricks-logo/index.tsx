interface FormbricksLogoProps {
  className?: string;
}

export const FormbricksLogo = ({ className }: FormbricksLogoProps) => {
  return <img src="/brand/fsinf-logo-mark.svg" alt="FS INF Formulare" className={className} />;
};
