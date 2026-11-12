/** The page backdrop: deep ink, three slow aurora blobs and a faint dot grid. Transforms only, behind everything. */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="aurora__blob aurora__blob--mint" />
      <span className="aurora__blob aurora__blob--aqua" />
      <span className="aurora__blob aurora__blob--violet" />
      <span className="aurora__grid" />
    </div>
  );
}
