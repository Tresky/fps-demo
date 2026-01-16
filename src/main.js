import * as THREE from 'three';

// Game constants
const PLAYER_SPEED = 15;
const JUMP_FORCE = 12;
const GRAVITY = 30;
const MOUSE_SENSITIVITY = 0.002;
const MAX_HEALTH = 100;
const MAX_AMMO = 30;
const MAX_RESERVE = 90;
const RELOAD_TIME = 2000;
const FIRE_RATE = 100;
const DAMAGE_PER_SHOT = 25;
const ENEMY_DAMAGE = 10;
const ENEMY_SPEED = 8;
const ENEMY_JUMP_FORCE = 10;
const PLAYER_RADIUS = 0.5;
const PLAYER_HEIGHT = 1.8;

// Game state
let health = MAX_HEALTH;
let ammo = MAX_AMMO;
let reserveAmmo = MAX_RESERVE;
let score = 0;
let wave = 1;
let isReloading = false;
let lastFireTime = 0;
let gameStarted = false;
let gameOver = false;

// Input state
const keys = { w: false, a: false, s: false, d: false, space: false, r: false };
const mouse = { locked: false };

// Camera control - separate yaw and pitch to prevent roll
let yaw = 0;
let pitch = 0;

// Physics
let playerVelocity = new THREE.Vector3();
let isOnGround = false;

// Arrays
const enemies = [];
const bullets = [];
const bloodParticles = [];
const pickups = [];
const colliders = []; // Simplified collision boxes

// Three.js setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game-container').insertBefore(renderer.domElement, document.getElementById('hud'));

// Lighting
const ambientLight = new THREE.AmbientLight(0x6688cc, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffcc, 1);
sunLight.position.set(50, 100, 50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 500;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

// Materials
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x3d5c3d, roughness: 0.8 });
const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x666680, roughness: 0.6 });
const rampMaterial = new THREE.MeshStandardMaterial({ color: 0x808060, roughness: 0.5 });
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.3 });
const healthPickupMaterial = new THREE.MeshStandardMaterial({ color: 0x33cc33, emissive: 0x115511 });
const ammoPickupMaterial = new THREE.MeshStandardMaterial({ color: 0xcccc33, emissive: 0x555511 });

// Collider helper - stores AABB for collision
function addCollider(minX, minY, minZ, maxX, maxY, maxZ, isGround = false) {
  colliders.push({
    min: new THREE.Vector3(minX, minY, minZ),
    max: new THREE.Vector3(maxX, maxY, maxZ),
    isGround
  });
}

// Create environment
function createEnvironment() {
  // Ground
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const ground = new THREE.Mesh(groundGeo, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  addCollider(-100, -1, -100, 100, 0, 100, true);

  // Central arena platforms
  createPlatform(0, 2, -20, 15, 1, 15);
  createPlatform(-25, 4, -10, 10, 1, 10);
  createPlatform(25, 4, -10, 10, 1, 10);
  createPlatform(0, 6, -40, 20, 1, 8);
  
  // Jumping pillars
  createPlatform(-40, 3, 20, 5, 6, 5);
  createPlatform(-30, 5, 25, 5, 1, 5);
  createPlatform(-20, 7, 20, 5, 1, 5);
  createPlatform(-10, 9, 25, 5, 1, 5);

  // Right side platforms
  createPlatform(40, 3, 20, 5, 6, 5);
  createPlatform(35, 6, 30, 8, 1, 8);
  createPlatform(45, 8, 40, 6, 1, 6);

  // Ramps
  createRamp(-15, 0, 0, 10, 4, 20, Math.PI * 0.1);
  createRamp(15, 0, 0, 10, 4, 20, -Math.PI * 0.1);
  createRamp(0, 0, 30, 15, 3, 15, Math.PI * 0.08);
  createRamp(-35, 0, -30, 12, 5, 20, Math.PI * 0.12);
  createRamp(35, 0, -30, 12, 5, 20, -Math.PI * 0.12);

  // Walls/barriers
  createWall(-50, 5, 0, 2, 10, 100);
  createWall(50, 5, 0, 2, 10, 100);
  createWall(0, 5, -50, 100, 10, 2);
  createWall(0, 5, 50, 100, 10, 2);

  // Cover objects
  createCover(20, 1.5, 15, 3, 3, 3);
  createCover(-20, 1.5, 15, 3, 3, 3);
  createCover(10, 1, -10, 4, 2, 2);
  createCover(-10, 1, -10, 4, 2, 2);
  createCover(30, 2, -25, 5, 4, 3);
  createCover(-30, 2, -25, 5, 4, 3);
}

function createPlatform(x, y, z, width, height, depth) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geo, platformMaterial);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  addCollider(x - width/2, y - height/2, z - depth/2, x + width/2, y + height/2, z + depth/2);
}

function createRamp(x, y, z, width, height, depth, angle) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geo, rampMaterial);
  mesh.position.set(x, y + height/2, z);
  mesh.rotation.x = angle;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  // Simplified ramp collider (treat as box for now)
  addCollider(x - width/2, y, z - depth/2, x + width/2, y + height, z + depth/2);
}

function createWall(x, y, z, width, height, depth) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, wallMat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  addCollider(x - width/2, y - height/2, z - depth/2, x + width/2, y + height/2, z + depth/2);
}

function createCover(x, y, z, width, height, depth) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x886644, roughness: 0.7 });
  const mesh = new THREE.Mesh(geo, coverMat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  addCollider(x - width/2, y - height/2, z - depth/2, x + width/2, y + height/2, z + depth/2);
}

// Collision detection - check if player cylinder collides with AABB
function checkCollision(posX, posY, posZ) {
  const playerMin = new THREE.Vector3(posX - PLAYER_RADIUS, posY, posZ - PLAYER_RADIUS);
  const playerMax = new THREE.Vector3(posX + PLAYER_RADIUS, posY + PLAYER_HEIGHT, posZ + PLAYER_RADIUS);
  
  for (const col of colliders) {
    if (playerMin.x < col.max.x && playerMax.x > col.min.x &&
        playerMin.y < col.max.y && playerMax.y > col.min.y &&
        playerMin.z < col.max.z && playerMax.z > col.min.z) {
      return col;
    }
  }
  return null;
}

// Enemy class
class Enemy {
  constructor(x, y, z) {
    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    this.mesh = new THREE.Mesh(bodyGeo, enemyMaterial.clone());
    this.mesh.position.set(x, y + 1, z);
    this.mesh.castShadow = true;
    
    // Eyes (angry!)
    const eyeGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0x888800 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2, 0.3, 0.4);
    this.mesh.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.2, 0.3, 0.4);
    this.mesh.add(rightEye);
    
    scene.add(this.mesh);
    
    this.health = 100;
    this.velocity = new THREE.Vector3();
    this.isOnGround = false;
    this.lastAttackTime = 0;
    this.jumpCooldown = 0;
  }

  update(delta, playerPos) {
    if (this.health <= 0) return;

    // Direction to player
    const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    dir.y = 0;
    const distance = dir.length();
    dir.normalize();

    // Face player
    if (distance > 0.1) {
      this.mesh.lookAt(new THREE.Vector3(playerPos.x, this.mesh.position.y, playerPos.z));
    }

    // Move towards player
    if (distance > 2) {
      this.velocity.x = dir.x * ENEMY_SPEED;
      this.velocity.z = dir.z * ENEMY_SPEED;
    } else {
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
    }

    // Jump if player is above or obstacle ahead
    this.jumpCooldown -= delta;
    if (this.isOnGround && this.jumpCooldown <= 0) {
      if (playerPos.y > this.mesh.position.y + 2 || Math.random() < 0.02) {
        this.velocity.y = ENEMY_JUMP_FORCE;
        this.isOnGround = false;
        this.jumpCooldown = 1.5;
      }
    }

    // Gravity
    this.velocity.y -= GRAVITY * delta;

    // Apply velocity
    this.mesh.position.x += this.velocity.x * delta;
    this.mesh.position.z += this.velocity.z * delta;
    this.mesh.position.y += this.velocity.y * delta;

    // Ground collision for enemies
    this.isOnGround = false;
    const enemyFeet = this.mesh.position.y - 1;
    
    for (const col of colliders) {
      const inX = this.mesh.position.x > col.min.x && this.mesh.position.x < col.max.x;
      const inZ = this.mesh.position.z > col.min.z && this.mesh.position.z < col.max.z;
      
      if (inX && inZ && enemyFeet <= col.max.y && enemyFeet > col.max.y - 1) {
        if (this.velocity.y < 0) {
          this.mesh.position.y = col.max.y + 1;
          this.velocity.y = 0;
          this.isOnGround = true;
          break;
        }
      }
    }

    // Minimum height
    if (this.mesh.position.y < 1) {
      this.mesh.position.y = 1;
      this.velocity.y = 0;
      this.isOnGround = true;
    }

    // Attack player if close
    if (distance < 2.5 && Date.now() - this.lastAttackTime > 1000) {
      this.lastAttackTime = Date.now();
      return true; // Signal attack
    }
    return false;
  }

  takeDamage(amount) {
    this.health -= amount;
    // Flash red
    this.mesh.material.emissive = new THREE.Color(0xff0000);
    setTimeout(() => {
      if (this.mesh.material) {
        this.mesh.material.emissive = new THREE.Color(0x000000);
      }
    }, 100);
    
    return this.health <= 0;
  }

  destroy() {
    scene.remove(this.mesh);
  }
}

// Blood particle system
function createBlood(position) {
  const particleCount = 15;
  for (let i = 0; i < particleCount; i++) {
    const geo = new THREE.SphereGeometry(0.05 + Math.random() * 0.1, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x880000 });
    const particle = new THREE.Mesh(geo, mat);
    particle.position.copy(position);
    particle.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      Math.random() * 8,
      (Math.random() - 0.5) * 10
    );
    particle.life = 1;
    scene.add(particle);
    bloodParticles.push(particle);
  }
}

// Bullet tracer
function createBulletTracer(start, end) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  direction.normalize();

  const geo = new THREE.CylinderGeometry(0.02, 0.02, length, 4);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 });
  const tracer = new THREE.Mesh(geo, mat);
  
  tracer.position.copy(start).add(direction.multiplyScalar(length / 2));
  tracer.lookAt(end);
  tracer.life = 0.1;
  
  scene.add(tracer);
  bullets.push(tracer);
}

// Pickup class
function createPickup(position, type) {
  const geo = type === 'health' 
    ? new THREE.BoxGeometry(0.8, 0.8, 0.8)
    : new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8);
  const mat = type === 'health' ? healthPickupMaterial : ammoPickupMaterial;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  mesh.position.y = 0.5;
  mesh.userData.type = type;
  mesh.userData.rotationSpeed = 2;
  scene.add(mesh);
  pickups.push(mesh);
}

// Spawn enemies
function spawnWave() {
  const enemyCount = Math.min(5 + wave * 2, 25);
  for (let i = 0; i < enemyCount; i++) {
    const angle = (i / enemyCount) * Math.PI * 2;
    const radius = 30 + Math.random() * 20;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    enemies.push(new Enemy(x, 1, z));
  }
  updateWaveDisplay();
}

// Shooting
function shoot() {
  if (isReloading || ammo <= 0 || Date.now() - lastFireTime < FIRE_RATE) return;
  
  lastFireTime = Date.now();
  ammo--;
  updateAmmoDisplay();

  // Raycast from camera
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  // Check enemy hits
  const enemyMeshes = enemies.filter(e => e.health > 0).map(e => e.mesh);
  const hits = raycaster.intersectObjects(enemyMeshes, true);

  let hitPoint = null;
  
  if (hits.length > 0) {
    hitPoint = hits[0].point;
    
    // Find the enemy that was hit
    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      
      // Check if this enemy's mesh or children were hit
      let wasHit = false;
      hits[0].object.traverseAncestors((obj) => {
        if (obj === enemy.mesh) wasHit = true;
      });
      if (hits[0].object === enemy.mesh) wasHit = true;
      
      if (wasHit) {
        const killed = enemy.takeDamage(DAMAGE_PER_SHOT);
        createBlood(hitPoint);
        
        if (killed) {
          score += 100;
          updateScoreDisplay();
          
          // Chance to drop pickup
          if (Math.random() < 0.3) {
            createPickup(enemy.mesh.position.clone(), Math.random() < 0.5 ? 'health' : 'ammo');
          }
          
          enemy.destroy();
        }
        break;
      }
    }
  }

  // Create tracer
  const start = camera.position.clone();
  const end = hitPoint || camera.position.clone().add(raycaster.ray.direction.multiplyScalar(100));
  createBulletTracer(start, end);

  // Auto-reload if empty
  if (ammo === 0 && reserveAmmo > 0) {
    reload();
  }
}

function reload() {
  if (isReloading || ammo === MAX_AMMO || reserveAmmo === 0) return;
  
  isReloading = true;
  document.getElementById('reload-indicator').style.display = 'block';
  
  setTimeout(() => {
    const needed = MAX_AMMO - ammo;
    const toReload = Math.min(needed, reserveAmmo);
    ammo += toReload;
    reserveAmmo -= toReload;
    isReloading = false;
    document.getElementById('reload-indicator').style.display = 'none';
    updateAmmoDisplay();
  }, RELOAD_TIME);
}

// Player physics with proper collision
function updatePlayer(delta) {
  // Update camera rotation from yaw/pitch (prevents roll)
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.rotation.z = 0; // Explicitly lock roll
  
  // Get forward/right vectors from yaw only (not affected by pitch)
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  // Movement input
  const moveDir = new THREE.Vector3();
  if (keys.w) moveDir.add(forward);
  if (keys.s) moveDir.sub(forward);
  if (keys.d) moveDir.add(right);
  if (keys.a) moveDir.sub(right);
  
  if (moveDir.length() > 0) {
    moveDir.normalize();
    playerVelocity.x = moveDir.x * PLAYER_SPEED;
    playerVelocity.z = moveDir.z * PLAYER_SPEED;
  } else {
    playerVelocity.x *= 0.8;
    playerVelocity.z *= 0.8;
  }

  // Jump
  if (keys.space && isOnGround) {
    playerVelocity.y = JUMP_FORCE;
    isOnGround = false;
  }

  // Gravity
  playerVelocity.y -= GRAVITY * delta;

  // Try to move X
  const newX = camera.position.x + playerVelocity.x * delta;
  if (!checkCollision(newX, camera.position.y, camera.position.z)) {
    camera.position.x = newX;
  } else {
    playerVelocity.x = 0;
  }

  // Try to move Z
  const newZ = camera.position.z + playerVelocity.z * delta;
  if (!checkCollision(camera.position.x, camera.position.y, newZ)) {
    camera.position.z = newZ;
  } else {
    playerVelocity.z = 0;
  }

  // Try to move Y
  const newY = camera.position.y + playerVelocity.y * delta;
  const colY = checkCollision(camera.position.x, newY, camera.position.z);
  if (!colY) {
    camera.position.y = newY;
  } else {
    // Landing on top of something
    if (playerVelocity.y < 0) {
      camera.position.y = colY.max.y;
      isOnGround = true;
    }
    playerVelocity.y = 0;
  }

  // Minimum height (standing on ground)
  if (camera.position.y < PLAYER_HEIGHT) {
    camera.position.y = PLAYER_HEIGHT;
    playerVelocity.y = 0;
    isOnGround = true;
  }

  // World bounds
  camera.position.x = Math.max(-48, Math.min(48, camera.position.x));
  camera.position.z = Math.max(-48, Math.min(48, camera.position.z));

  // Reload key
  if (keys.r) {
    reload();
    keys.r = false;
  }

  // Pickup collection
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    const dist = camera.position.distanceTo(pickup.position);
    
    if (dist < 2) {
      if (pickup.userData.type === 'health') {
        health = Math.min(MAX_HEALTH, health + 25);
        updateHealthDisplay();
      } else {
        reserveAmmo = Math.min(MAX_RESERVE, reserveAmmo + 15);
        updateAmmoDisplay();
      }
      scene.remove(pickup);
      pickups.splice(i, 1);
    }
  }
}

// Update functions
function updateBlood(delta) {
  for (let i = bloodParticles.length - 1; i >= 0; i--) {
    const p = bloodParticles[i];
    p.velocity.y -= 20 * delta;
    p.position.add(p.velocity.clone().multiplyScalar(delta));
    p.life -= delta * 2;
    
    if (p.life <= 0 || p.position.y < 0) {
      scene.remove(p);
      bloodParticles.splice(i, 1);
    }
  }
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= delta;
    b.material.opacity = b.life * 8;
    
    if (b.life <= 0) {
      scene.remove(b);
      bullets.splice(i, 1);
    }
  }
}

function updatePickups(delta) {
  for (const pickup of pickups) {
    pickup.rotation.y += pickup.userData.rotationSpeed * delta;
    pickup.position.y = 0.5 + Math.sin(Date.now() * 0.003) * 0.2;
  }
}

function updateEnemies(delta) {
  let allDead = true;
  
  for (const enemy of enemies) {
    if (enemy.health <= 0) continue;
    allDead = false;
    
    const attacked = enemy.update(delta, camera.position);
    if (attacked) {
      takeDamage(ENEMY_DAMAGE);
    }
  }

  // Next wave
  if (allDead && enemies.length > 0) {
    wave++;
    enemies.length = 0;
    setTimeout(() => spawnWave(), 2000);
    showMessage('WAVE ' + wave, 2000);
  }
}

function takeDamage(amount) {
  health -= amount;
  updateHealthDisplay();
  
  // Damage flash
  const overlay = document.getElementById('damage-overlay');
  overlay.style.opacity = '1';
  setTimeout(() => overlay.style.opacity = '0', 200);
  
  if (health <= 0) {
    endGame();
  }
}

// UI updates
function updateHealthDisplay() {
  document.getElementById('health-fill').style.width = `${health}%`;
}

function updateAmmoDisplay() {
  document.getElementById('ammo').textContent = `${ammo} / ${reserveAmmo}`;
}

function updateScoreDisplay() {
  document.getElementById('score').textContent = `Score: ${score}`;
}

function updateWaveDisplay() {
  document.getElementById('wave').textContent = `Wave ${wave}`;
}

function showMessage(text, duration) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.style.display = 'block';
  setTimeout(() => msg.style.display = 'none', duration);
}

function endGame() {
  gameOver = true;
  document.exitPointerLock();
  showMessage(`GAME OVER\nScore: ${score}\nClick to restart`, 999999);
}

function restartGame() {
  health = MAX_HEALTH;
  ammo = MAX_AMMO;
  reserveAmmo = MAX_RESERVE;
  score = 0;
  wave = 1;
  gameOver = false;
  
  // Clear enemies
  for (const enemy of enemies) {
    enemy.destroy();
  }
  enemies.length = 0;
  
  // Clear pickups
  for (const pickup of pickups) {
    scene.remove(pickup);
  }
  pickups.length = 0;
  
  // Reset player
  camera.position.set(0, PLAYER_HEIGHT, 0);
  playerVelocity.set(0, 0, 0);
  yaw = 0;
  pitch = 0;
  
  updateHealthDisplay();
  updateAmmoDisplay();
  updateScoreDisplay();
  updateWaveDisplay();
  
  document.getElementById('message').style.display = 'none';
  
  spawnWave();
}

// Input handlers
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW') keys.w = true;
  if (e.code === 'KeyA') keys.a = true;
  if (e.code === 'KeyS') keys.s = true;
  if (e.code === 'KeyD') keys.d = true;
  if (e.code === 'Space') { keys.space = true; e.preventDefault(); }
  if (e.code === 'KeyR') keys.r = true;
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') keys.w = false;
  if (e.code === 'KeyA') keys.a = false;
  if (e.code === 'KeyS') keys.s = false;
  if (e.code === 'KeyD') keys.d = false;
  if (e.code === 'Space') keys.space = false;
  if (e.code === 'KeyR') keys.r = false;
});

document.addEventListener('mousemove', (e) => {
  if (!mouse.locked) return;
  
  // Update yaw and pitch separately - no roll accumulation possible
  yaw -= e.movementX * MOUSE_SENSITIVITY;
  pitch -= e.movementY * MOUSE_SENSITIVITY;
  
  // Clamp pitch to prevent flipping
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
});

document.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    if (!gameStarted) {
      startGame();
    } else if (gameOver) {
      restartGame();
      document.body.requestPointerLock();
    } else if (mouse.locked) {
      shoot();
    }
  }
});

document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement !== null;
});

// Start game
function startGame() {
  gameStarted = true;
  document.getElementById('start-screen').style.display = 'none';
  document.body.requestPointerLock();
  createEnvironment();
  spawnWave();
}

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Game loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  
  const delta = Math.min(clock.getDelta(), 0.1);
  
  if (gameStarted && !gameOver) {
    updatePlayer(delta);
    updateEnemies(delta);
    updateBlood(delta);
    updateBullets(delta);
    updatePickups(delta);
  }
  
  renderer.render(scene, camera);
}

animate();
