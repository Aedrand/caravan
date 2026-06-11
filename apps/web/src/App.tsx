// Placeholder splash — the real app shell (router, providers, design tokens) lands in M0.6
export function App() {
  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100dvh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", margin: 0 }}>🚐 Caravan</h1>
        <p style={{ color: "#666" }}>Plan trips together. Under construction.</p>
      </div>
    </main>
  );
}
