import type { CodeCityStats } from '../analyzers/codecity-analyzer.js';

/**
 * Generate a standalone HTML file with Three.js 3D Code City visualization
 * Uses a compact treemap-style layout for better space utilization
 */
export function renderCodeCity3D(stats: CodeCityStats, repoName: string = 'Repository'): string {
  const cityData = JSON.stringify({
    districts: stats.city,
    buildings: stats.buildings,
    summary: stats.summary,
    healthIndicators: stats.healthIndicators,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code City - ${escapeHtml(repoName)}</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      background: #0a0a1a;
      color: #fff;
      overflow: hidden;
    }

    #canvas-container {
      width: 100vw;
      height: 100vh;
      position: relative;
    }

    #info-panel {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(20, 20, 40, 0.95);
      padding: 20px;
      border-radius: 12px;
      max-width: 320px;
      border: 1px solid rgba(100, 100, 255, 0.3);
      backdrop-filter: blur(10px);
      z-index: 100;
    }

    #info-panel h1 {
      font-size: 1.4rem;
      margin-bottom: 10px;
      color: #00d9ff;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #info-panel .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 15px;
    }

    #info-panel .stat {
      background: rgba(0, 217, 255, 0.1);
      padding: 10px;
      border-radius: 8px;
      text-align: center;
    }

    #info-panel .stat-value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #00d9ff;
    }

    #info-panel .stat-label {
      font-size: 0.75rem;
      color: #888;
      text-transform: uppercase;
    }

    #info-panel .legend {
      display: flex;
      gap: 15px;
      font-size: 0.8rem;
      margin-top: 10px;
    }

    #info-panel .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    #info-panel .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 3px;
    }

    #tooltip {
      position: absolute;
      background: rgba(20, 20, 40, 0.95);
      padding: 15px;
      border-radius: 8px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      border: 1px solid rgba(100, 100, 255, 0.3);
      max-width: 350px;
      z-index: 200;
    }

    #tooltip.visible { opacity: 1; }

    #tooltip h3 {
      color: #00d9ff;
      font-size: 0.9rem;
      margin-bottom: 8px;
      word-break: break-all;
    }

    #tooltip .metric {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      padding: 3px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    #tooltip .metric:last-child { border-bottom: none; }

    #tooltip .metric-label { color: #888; }
    #tooltip .metric-value { color: #fff; font-weight: bold; }

    #tooltip .health-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: bold;
      text-transform: uppercase;
    }

    #tooltip .health-healthy { background: #10b981; color: #fff; }
    #tooltip .health-warning { background: #f59e0b; color: #000; }
    #tooltip .health-critical { background: #ef4444; color: #fff; }

    #controls-help {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(20, 20, 40, 0.8);
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 0.75rem;
      color: #888;
    }

    #controls-help kbd {
      background: rgba(255,255,255,0.1);
      padding: 2px 6px;
      border-radius: 3px;
      margin: 0 2px;
    }

    #district-panel {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(20, 20, 40, 0.95);
      padding: 15px;
      border-radius: 12px;
      max-width: 250px;
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid rgba(100, 100, 255, 0.3);
      z-index: 100;
    }

    #district-panel h2 {
      font-size: 1rem;
      margin-bottom: 10px;
      color: #00d9ff;
    }

    #district-panel .district {
      padding: 8px;
      margin-bottom: 5px;
      background: rgba(255,255,255,0.05);
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s;
    }

    #district-panel .district:hover {
      background: rgba(0, 217, 255, 0.2);
    }

    #district-panel .district-name {
      font-size: 0.85rem;
      font-weight: bold;
    }

    #district-panel .district-meta {
      font-size: 0.7rem;
      color: #888;
    }

    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }

    .loading-spinner {
      width: 50px;
      height: 50px;
      border: 3px solid rgba(0, 217, 255, 0.3);
      border-top-color: #00d9ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="canvas-container">
    <div class="loading" id="loading">
      <div class="loading-spinner"></div>
      <p style="margin-top: 15px; color: #00d9ff;">Building Code City...</p>
    </div>
  </div>

  <div id="info-panel">
    <h1>🏙️ Code City</h1>
    <div class="stats">
      <div class="stat">
        <div class="stat-value" id="stat-health">-</div>
        <div class="stat-label">Health</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="stat-buildings">-</div>
        <div class="stat-label">Buildings</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="stat-districts">-</div>
        <div class="stat-label">Districts</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="stat-loc">-</div>
        <div class="stat-label">Total LOC</div>
      </div>
    </div>
    <div class="legend">
      <div class="legend-item">
        <div class="legend-color" style="background: #10b981;"></div>
        <span>Healthy</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #f59e0b;"></div>
        <span>Warning</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #ef4444;"></div>
        <span>Critical</span>
      </div>
    </div>
  </div>

  <div id="district-panel">
    <h2>📁 Districts</h2>
    <div id="district-list"></div>
  </div>

  <div id="tooltip"></div>

  <div id="controls-help">
    <kbd>Left Click + Drag</kbd> Rotate |
    <kbd>Right Click + Drag</kbd> Pan |
    <kbd>Scroll</kbd> Zoom |
    <kbd>Click Building</kbd> Details
  </div>

  <script>
    // City data from analyzer
    const cityData = ${cityData};

    // Three.js setup
    let scene, camera, renderer, controls;
    let buildingMeshes = [];
    let raycaster, mouse;
    let selectedBuilding = null;

    // Colors
    const COLORS = {
      healthy: 0x10b981,
      warning: 0xf59e0b,
      critical: 0xef4444,
      ground: 0x1a1a2e,
      grid: 0x2a2a4e,
      districtBorder: 0x4a4a8e,
    };

    function init() {
      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a1a);
      scene.fog = new THREE.Fog(0x0a0a1a, 100, 500);

      // Camera
      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(80, 60, 80);

      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      document.getElementById('canvas-container').appendChild(renderer.domElement);

      // Controls
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 2.1;
      controls.minDistance = 20;
      controls.maxDistance = 300;

      // Raycaster for mouse interaction
      raycaster = new THREE.Raycaster();
      mouse = new THREE.Vector2();

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(50, 100, 50);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = 500;
      directionalLight.shadow.camera.left = -150;
      directionalLight.shadow.camera.right = 150;
      directionalLight.shadow.camera.top = 150;
      directionalLight.shadow.camera.bottom = -150;
      scene.add(directionalLight);

      // Add hemisphere light for better ambiance
      const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x1a1a2e, 0.3);
      scene.add(hemiLight);

      // Build the city
      buildCity();

      // Update UI
      updateInfoPanel();
      updateDistrictPanel();

      // Events
      window.addEventListener('resize', onWindowResize);
      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('click', onMouseClick);

      // Hide loading
      document.getElementById('loading').style.display = 'none';

      // Start animation
      animate();
    }

    function buildCity() {
      const buildings = cityData.buildings;

      // Sort buildings by directory path for grouping, then by LOC for visual impact
      const sortedBuildings = [...buildings].sort((a, b) => {
        const dirA = a.path.split('/').slice(0, -1).join('/');
        const dirB = b.path.split('/').slice(0, -1).join('/');
        if (dirA !== dirB) return dirA.localeCompare(dirB);
        return (b.metrics?.loc || 0) - (a.metrics?.loc || 0);
      });

      // Calculate total area needed based on building footprints
      const buildingSpacing = 1.5; // Gap between buildings
      const minBuildingSize = 1.5;
      const maxBuildingSize = 4;

      // Use a strip packing algorithm - place buildings in rows
      let currentX = 0;
      let currentZ = 0;
      let rowHeight = 0;
      let maxRowWidth = Math.ceil(Math.sqrt(sortedBuildings.length)) * (maxBuildingSize + buildingSpacing);

      // Track district colors for visual grouping
      const districtColors = {};
      const districtHues = [200, 160, 280, 320, 40, 80, 0, 240]; // Different hues for districts
      let hueIndex = 0;

      // First pass: calculate positions
      const buildingPositions = [];
      let currentDir = '';

      sortedBuildings.forEach((building, i) => {
        const loc = building.metrics?.loc || 100;
        const width = Math.max(minBuildingSize, Math.min(maxBuildingSize, Math.sqrt(loc) / 8));

        const dir = building.path.split('/').slice(0, -1).join('/') || 'root';

        // Assign district color
        if (!districtColors[dir]) {
          districtColors[dir] = districtHues[hueIndex % districtHues.length];
          hueIndex++;
        }

        // Start new row if needed or if changing districts (slight gap)
        if (currentX + width > maxRowWidth) {
          currentX = 0;
          currentZ += rowHeight + buildingSpacing;
          rowHeight = 0;
        }

        // Add small gap when changing directories
        if (dir !== currentDir && currentX > 0) {
          currentX += buildingSpacing * 2;
          if (currentX + width > maxRowWidth) {
            currentX = 0;
            currentZ += rowHeight + buildingSpacing;
            rowHeight = 0;
          }
        }
        currentDir = dir;

        buildingPositions.push({
          building,
          x: currentX + width / 2,
          z: currentZ + width / 2,
          width,
          dir,
          hue: districtColors[dir]
        });

        currentX += width + buildingSpacing;
        rowHeight = Math.max(rowHeight, width);
      });

      // Calculate city bounds
      const cityWidth = maxRowWidth + 20;
      const cityDepth = currentZ + rowHeight + 20;

      // Center offset
      const offsetX = -cityWidth / 2;
      const offsetZ = -cityDepth / 2;

      // Create ground plane
      const groundGeometry = new THREE.PlaneGeometry(cityWidth + 40, cityDepth + 40);
      const groundMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.ground,
        roughness: 0.9,
        metalness: 0.1,
      });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.1;
      ground.receiveShadow = true;
      scene.add(ground);

      // Create grid
      const gridSize = Math.max(cityWidth, cityDepth) + 40;
      const gridHelper = new THREE.GridHelper(gridSize, Math.floor(gridSize / 5), COLORS.grid, COLORS.grid);
      gridHelper.position.y = 0.01;
      scene.add(gridHelper);

      // Create buildings with calculated positions
      buildingPositions.forEach(pos => {
        createBuilding(pos.building, pos.x + offsetX, pos.z + offsetZ, pos.width, pos.hue);
      });

      // Create district labels/markers on ground
      const processedDirs = new Set();
      buildingPositions.forEach(pos => {
        if (!processedDirs.has(pos.dir)) {
          processedDirs.add(pos.dir);
          // Create a subtle ground marker for district
          const markerGeometry = new THREE.PlaneGeometry(2, 2);
          const markerMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(pos.hue / 360, 0.5, 0.3),
            transparent: true,
            opacity: 0.5,
          });
          const marker = new THREE.Mesh(markerGeometry, markerMaterial);
          marker.rotation.x = -Math.PI / 2;
          marker.position.set(pos.x + offsetX, 0.02, pos.z + offsetZ);
          scene.add(marker);
        }
      });

      // Center camera on city
      controls.target.set(0, 0, 0);
      camera.position.set(cityWidth * 0.6, cityWidth * 0.5, cityDepth * 0.6);
    }

    function createBuilding(buildingData, x, z, size, districtHue) {
      // Calculate dimensions based on metrics
      const loc = buildingData.metrics?.loc || 100;
      const height = Math.max(1, Math.min(loc / 15, 60)); // Scale height, cap at 60
      const width = size;
      const depth = size;

      // Determine color based on health
      let color;
      let emissiveColor;
      switch (buildingData.health) {
        case 'critical':
          color = COLORS.critical;
          emissiveColor = COLORS.critical;
          break;
        case 'warning':
          color = COLORS.warning;
          emissiveColor = COLORS.warning;
          break;
        default:
          // Use district hue for healthy buildings for visual grouping
          color = new THREE.Color().setHSL(districtHue / 360, 0.6, 0.45);
          emissiveColor = new THREE.Color().setHSL(districtHue / 360, 0.7, 0.3);
      }

      // Create building geometry
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.3,
        emissive: emissiveColor,
        emissiveIntensity: 0.15,
      });

      const building = new THREE.Mesh(geometry, material);
      building.position.set(x, height / 2 + 0.5, z);
      building.castShadow = true;
      building.receiveShadow = true;

      // Store building data for tooltip
      building.userData = {
        ...buildingData,
        isBuilding: true,
        originalColor: color,
        originalEmissive: emissiveColor,
      };

      scene.add(building);
      buildingMeshes.push(building);

      // Add roof accent for tall buildings
      if (height > 15) {
        const roofGeometry = new THREE.BoxGeometry(width * 0.5, 1, depth * 0.5);
        const roofMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: emissiveColor,
          emissiveIntensity: 0.4,
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, height + 1, z);
        scene.add(roof);
      }

      // Add windows effect for larger buildings
      if (height > 5 && width > 1.5) {
        const windowRows = Math.floor(height / 3);
        const windowCols = Math.floor(width / 0.8);

        for (let row = 0; row < Math.min(windowRows, 10); row++) {
          for (let col = 0; col < Math.min(windowCols, 3); col++) {
            const windowGeometry = new THREE.PlaneGeometry(0.3, 0.5);
            const windowMaterial = new THREE.MeshBasicMaterial({
              color: 0xffffcc,
              transparent: true,
              opacity: Math.random() > 0.3 ? 0.8 : 0.2, // Some windows lit, some dark
            });

            // Front face
            const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
            windowMesh.position.set(
              x - width/2 + 0.4 + col * 0.8,
              1.5 + row * 3,
              z + depth/2 + 0.01
            );
            scene.add(windowMesh);
          }
        }
      }
    }

    function updateInfoPanel() {
      const summary = cityData.summary;
      document.getElementById('stat-health').textContent = summary.overallHealth + '/100';
      document.getElementById('stat-health').style.color =
        summary.overallHealth >= 70 ? '#10b981' :
        summary.overallHealth >= 40 ? '#f59e0b' : '#ef4444';
      document.getElementById('stat-buildings').textContent = summary.totalBuildings;
      document.getElementById('stat-districts').textContent = summary.totalDistricts;
      document.getElementById('stat-loc').textContent = summary.totalLOC.toLocaleString();
    }

    function updateDistrictPanel() {
      const list = document.getElementById('district-list');
      list.innerHTML = '';

      cityData.districts.forEach((district, index) => {
        const div = document.createElement('div');
        div.className = 'district';
        div.innerHTML = \`
          <div class="district-name">\${district.name}</div>
          <div class="district-meta">\${district.metrics.totalFiles} files | Health: \${district.metrics.healthScore.toFixed(0)}/100</div>
        \`;
        div.onclick = () => focusOnDistrict(index);
        list.appendChild(div);
      });
    }

    function focusOnDistrict(index) {
      const district = cityData.districts[index];
      if (!district) return;

      // Find buildings belonging to this district
      const districtBuildings = buildingMeshes.filter(mesh => {
        const path = mesh.userData.path || '';
        return path.startsWith(district.name + '/') || path.split('/')[0] === district.name;
      });

      if (districtBuildings.length === 0) return;

      // Calculate center of district buildings
      let sumX = 0, sumZ = 0;
      districtBuildings.forEach(b => {
        sumX += b.position.x;
        sumZ += b.position.z;
      });

      const centerX = sumX / districtBuildings.length;
      const centerZ = sumZ / districtBuildings.length;

      // Animate camera to district center
      const targetPosition = new THREE.Vector3(centerX + 20, 25, centerZ + 20);
      const targetLookAt = new THREE.Vector3(centerX, 5, centerZ);

      // Simple animation
      const startPosition = camera.position.clone();
      const startTarget = controls.target.clone();
      let progress = 0;

      function animateCamera() {
        progress += 0.025;
        if (progress < 1) {
          camera.position.lerpVectors(startPosition, targetPosition, easeInOutCubic(progress));
          controls.target.lerpVectors(startTarget, targetLookAt, easeInOutCubic(progress));
          requestAnimationFrame(animateCamera);
        }
      }
      animateCamera();

      // Highlight district buildings briefly
      districtBuildings.forEach(b => {
        b.material.emissiveIntensity = 0.5;
        setTimeout(() => {
          b.material.emissiveIntensity = 0.15;
        }, 1500);
      });
    }

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function onMouseMove(event) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(buildingMeshes);

      const tooltip = document.getElementById('tooltip');

      if (intersects.length > 0) {
        const building = intersects[0].object;
        const data = building.userData;

        if (data.isBuilding) {
          // Highlight building
          if (selectedBuilding && selectedBuilding !== building) {
            selectedBuilding.material.emissiveIntensity = 0.1;
          }
          building.material.emissiveIntensity = 0.4;
          selectedBuilding = building;

          // Show tooltip
          tooltip.innerHTML = \`
            <h3>\${data.path}</h3>
            <div class="metric">
              <span class="metric-label">Health</span>
              <span class="health-badge health-\${data.health}">\${data.health}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Lines of Code</span>
              <span class="metric-value">\${data.metrics?.loc?.toLocaleString() || 'N/A'}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Complexity</span>
              <span class="metric-value">\${data.metrics?.complexity || 'N/A'}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Churn</span>
              <span class="metric-value">\${data.metrics?.churn || 'N/A'}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Age (days)</span>
              <span class="metric-value">\${data.metrics?.age || 'N/A'}</span>
            </div>
            \${data.healthReasons?.length ? '<hr style="margin: 8px 0; border-color: rgba(255,255,255,0.1);">' +
              data.healthReasons.slice(0, 3).map(r => '<div style="font-size: 0.75rem; color: #f59e0b;">⚠️ ' + r + '</div>').join('') : ''}
          \`;

          tooltip.style.left = (event.clientX + 15) + 'px';
          tooltip.style.top = (event.clientY + 15) + 'px';
          tooltip.classList.add('visible');

          document.body.style.cursor = 'pointer';
        }
      } else {
        if (selectedBuilding) {
          selectedBuilding.material.emissiveIntensity = 0.1;
          selectedBuilding = null;
        }
        tooltip.classList.remove('visible');
        document.body.style.cursor = 'default';
      }
    }

    function onMouseClick(event) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(buildingMeshes);

      if (intersects.length > 0) {
        const building = intersects[0].object;
        const data = building.userData;

        // Zoom to building
        const targetPosition = new THREE.Vector3(
          building.position.x + 15,
          building.position.y + 10,
          building.position.z + 15
        );

        const startPosition = camera.position.clone();
        const startTarget = controls.target.clone();
        let progress = 0;

        function animateToBuilding() {
          progress += 0.03;
          if (progress < 1) {
            camera.position.lerpVectors(startPosition, targetPosition, easeInOutCubic(progress));
            controls.target.lerpVectors(startTarget, building.position, easeInOutCubic(progress));
            requestAnimationFrame(animateToBuilding);
          }
        }
        animateToBuilding();
      }
    }

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    // Start
    init();
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
