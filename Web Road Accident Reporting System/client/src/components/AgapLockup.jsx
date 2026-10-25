// Both lockups are rendered; CSS (agap.css) shows the one that matches the active
// theme, so the swap is instant and needs no JS or re-render on toggle.
export default function AgapLockup() {
  const alt = 'AGAP road incident reporting';
  return (
    <>
      <img className="agap-lockup agap-lockup-dark" src="/agap-logo.png" alt={alt} />
      <img className="agap-lockup agap-lockup-light" src="/agap-logo-light.png" alt={alt} />
    </>
  );
}
