const KIND_COLORS = {
  domain: 0x6ee7b7,
  service: 0x60a5fa,
  module: 0xa78bfa,
  file: 0xfbbf24,
  symbol: 0xf472b6,
  finding: 0xf87171,
};

const KIND_SIZES = {
  domain: 0.9,
  service: 1.1,
  module: 0.85,
  file: 0.55,
  symbol: 0.35,
  finding: 0.7,
};

const DIFF_COLORS = {
  added: 0x34d399,
  removed: 0xf87171,
  modified: 0xfbbf24,
  unchanged: null,
};

function nodeColor(node) {
  if (node.diffState && DIFF_COLORS[node.diffState]) {
    return DIFF_COLORS[node.diffState];
  }
  return KIND_COLORS[node.kind] ?? 0xffffff;
}

export function initSpatialNavigator(container, graph, { onSelect } = {}) {
  if (!graph?.nodes?.length) {
    container.innerHTML = "<p class=\"muted\">No spatial graph data.</p>";
    return () => undefined;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "spatial-canvas";
  container.innerHTML = "";
  container.appendChild(canvas);

  let renderer;
  let scene;
  let camera;
  let animationId;
  let disposed = false;

  const loadThree = () =>
    new Promise((resolve, reject) => {
      if (window.THREE) return resolve(window.THREE);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/three@0.160.0/build/three.min.js";
      script.onload = () => resolve(window.THREE);
      script.onerror = () => reject(new Error("Failed to load Three.js"));
      document.head.appendChild(script);
    });

  loadThree()
    .then((THREE) => {
      if (disposed) return;

      const width = container.clientWidth || 640;
      const height = container.clientHeight || 360;

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(width, height);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0a0f1e, 0.012);

      camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500);
      camera.position.set(0, 30, 55);

      const ambient = new THREE.AmbientLight(0xffffff, 0.55);
      const point = new THREE.PointLight(0x93c5fd, 1.2, 200);
      point.position.set(20, 40, 30);
      scene.add(ambient, point);

      const nodeMeshes = new Map();
      const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

      const hasDiffOverlay = graph.nodes.some((n) => n.diffState && n.diffState !== "unchanged");

      for (const node of graph.nodes) {
        const radius = (KIND_SIZES[node.kind] ?? 0.5) * (node.diffState === "added" ? 1.25 : 1);
        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        const color = nodeColor(node);
        const material = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: node.diffState && node.diffState !== "unchanged" ? 0.55 : 0.25,
          metalness: 0.2,
          roughness: 0.4,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(node.position.x, node.position.z, node.position.y);
        mesh.userData = node;
        scene.add(mesh);
        nodeMeshes.set(node.id, mesh);
      }

      for (const edge of graph.edges) {
        const from = nodeMeshes.get(edge.from);
        const to = nodeMeshes.get(edge.to);
        if (!from || !to) continue;
        const points = [from.position.clone(), to.position.clone()];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: 0x334155,
          transparent: true,
          opacity: 0.35,
        });
        scene.add(new THREE.Line(geometry, material));
      }

      for (const layer of graph.layers ?? []) {
        const planeGeo = new THREE.PlaneGeometry(80, 80);
        const planeMat = new THREE.MeshBasicMaterial({
          color: 0x1e293b,
          transparent: true,
          opacity: 0.06,
          side: THREE.DoubleSide,
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = layer.z;
        scene.add(plane);
      }

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let selectedId = null;

      function onPointerMove(event) {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      }

      function onClick() {
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects([...nodeMeshes.values()]);
        const hit = hits[0]?.object;
        if (!hit) return;
        selectedId = hit.userData.id;
        for (const mesh of nodeMeshes.values()) {
          mesh.material.emissiveIntensity = mesh.userData.id === selectedId ? 0.7 : 0.25;
        }
        onSelect?.(hit.userData);
      }

      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("click", onClick);

      let orbitTheta = 0;
      let pulse = 0;
      const animate = () => {
        if (disposed) return;
        orbitTheta += 0.0025;
        pulse += 0.06;
        camera.position.x = Math.sin(orbitTheta) * 55;
        camera.position.z = Math.cos(orbitTheta) * 55;
        camera.lookAt(0, 12, 0);
        if (hasDiffOverlay) {
          for (const mesh of nodeMeshes.values()) {
            const state = mesh.userData.diffState;
            if (state && state !== "unchanged") {
              mesh.material.emissiveIntensity = 0.45 + Math.sin(pulse) * 0.2;
            }
          }
        }
        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };
      animate();

      const onResize = () => {
        const w = container.clientWidth || 640;
        const h = container.clientHeight || 360;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      container._spatialCleanup = () => {
        disposed = true;
        cancelAnimationFrame(animationId);
        window.removeEventListener("resize", onResize);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("click", onClick);
        renderer.dispose();
      };
    })
    .catch((error) => {
      container.innerHTML = `<p class="muted">${error.message}</p>`;
    });

  return () => container._spatialCleanup?.();
}