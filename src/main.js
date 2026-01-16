import * as THREE from 'three';

// Game constants
const PLAYER_SPEED = 15;
const JUMP_FORCE = 15;
const GRAVITY = 30;
const MOUSE_SENSITIVITY = 0.002;
const MAX_HEALTH = 100;
const MAX_AMMO = 30;
const MAX_RESERVE = 90;
const RELOAD_TIME = 800; // Faster reload
const FIRE_RATE = 100;
const DAMAGE_PER_SHOT = 25;
const ENEMY_DAMAGE = 10;
const ENEMY_SPEED = 8;
const ENEMY_JUMP_FORCE = 10;
const PLAYER_RADIUS = 0.5;
const PLAYER_HEIGHT = 1.8;
const ROCKET_SPEED = 50;
const ROCKET_DAMAGE = 100;
const ROCKET_COOLDOWN = 1500;
const EXPLOSION_RADIUS = 8;

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
const mouse = { locked: false, leftDown: false, rightDown: false };
let lastRocketTime = 0;

// Camera control - separate yaw and pitch to prevent roll
let yaw = 0;
let pitch = 0;

// Physics
let playerVelocity = new THREE.Vector3();
let isOnGround = false;
let canDoubleJump = false;

// Arrays
const enemies = [];
const bullets = [];
const rockets = [];
const explosions = [];
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
function addCollider(minX, minY, minZ, maxX, maxY, maxZ, isGround = false, isRamp = false, rampData = null) {
  colliders.push({
    min: new THREE.Vector3(minX, minY, minZ),
    max: new THREE.Vector3(maxX, maxY, maxZ),
    isGround,
    isRamp,
    rampData // { x, z, baseY, topY, depth, angle } for calculating height at position
  });
}

// Get ground height at a position (for ramps)
function getGroundHeight(x, z) {
  let maxHeight = 0;
  
  for (const col of colliders) {
    // Check if position is within X/Z bounds
    if (x >= col.min.x && x <= col.max.x && z >= col.min.z && z <= col.max.z) {
      if (col.isRamp && col.rampData) {
        // Calculate height on ramp based on Z position
        const rd = col.rampData;
        const progress = (z - rd.minZ) / (rd.maxZ - rd.minZ);
        const height = rd.minY + progress * (rd.maxY - rd.minY);
        if (height > maxHeight) maxHeight = height;
      } else if (col.isGround || !col.isRamp) {
        if (col.max.y > maxHeight) maxHeight = col.max.y;
      }
    }
  }
  
  return maxHeight;
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
  
  // Calculate ramp height at each end based on angle
  // Positive angle: higher at -Z end, lower at +Z end
  // The ramp rises by tan(angle) * depth
  const rise = Math.tan(Math.abs(angle)) * depth;
  const minY = y;
  const maxY = y + rise;
  
  // Ramp data for ground height calculation
  const rampData = {
    minZ: z - depth/2,
    maxZ: z + depth/2,
    minY: angle > 0 ? maxY : minY, // height at minZ
    maxY: angle > 0 ? minY : maxY  // height at maxZ
  };
  
  addCollider(x - width/2, y, z - depth/2, x + width/2, y + rise + 0.5, z + depth/2, false, true, rampData);
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
// skipRamps: if true, don't count ramps as blocking (we handle them with ground height)
function checkCollision(posX, posY, posZ, skipRamps = false) {
  const playerMin = new THREE.Vector3(posX - PLAYER_RADIUS, posY, posZ - PLAYER_RADIUS);
  const playerMax = new THREE.Vector3(posX + PLAYER_RADIUS, posY + PLAYER_HEIGHT, posZ + PLAYER_RADIUS);
  
  for (const col of colliders) {
    // Skip ramps for horizontal collision - we'll use ground height instead
    if (skipRamps && col.isRamp) continue;
    
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

  checkEnemyCollision(posX, posY, posZ) {
    const radius = 0.5;
    const height = 2;
    const eMin = new THREE.Vector3(posX - radius, posY, posZ - radius);
    const eMax = new THREE.Vector3(posX + radius, posY + height, posZ + radius);
    
    for (const col of colliders) {
      if (col.isGround) continue; // Skip ground for horizontal collision
      if (col.isRamp) continue; // Skip ramps - handled by ground height
      if (eMin.x < col.max.x && eMax.x > col.min.x &&
          eMin.y < col.max.y && eMax.y > col.min.y &&
          eMin.z < col.max.z && eMax.z > col.min.z) {
        return col;
      }
    }
    return null;
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

    // Jump if player is above or blocked by obstacle
    this.jumpCooldown -= delta;
    if (this.isOnGround && this.jumpCooldown <= 0) {
      // Check if there's an obstacle ahead
      const aheadX = this.mesh.position.x + dir.x * 1.5;
      const aheadZ = this.mesh.position.z + dir.z * 1.5;
      const blocked = this.checkEnemyCollision(aheadX, this.mesh.position.y - 1, aheadZ);
      
      if (playerPos.y > this.mesh.position.y + 2 || blocked || Math.random() < 0.01) {
        this.velocity.y = ENEMY_JUMP_FORCE;
        this.isOnGround = false;
        this.jumpCooldown = 1.5;
      }
    }

    // Gravity
    this.velocity.y -= GRAVITY * delta;

    // Try to move X with collision
    const newX = this.mesh.position.x + this.velocity.x * delta;
    if (!this.checkEnemyCollision(newX, this.mesh.position.y - 1, this.mesh.position.z)) {
      this.mesh.position.x = newX;
    } else {
      this.velocity.x = 0;
    }

    // Try to move Z with collision
    const newZ = this.mesh.position.z + this.velocity.z * delta;
    if (!this.checkEnemyCollision(this.mesh.position.x, this.mesh.position.y - 1, newZ)) {
      this.mesh.position.z = newZ;
    } else {
      this.velocity.z = 0;
    }

    // Move Y
    this.mesh.position.y += this.velocity.y * delta;

    // Ground collision for enemies (including ramps)
    this.isOnGround = false;
    const enemyFeet = this.mesh.position.y - 1;
    const groundHeight = getGroundHeight(this.mesh.position.x, this.mesh.position.z);
    
    // Snap to ground/ramp if close enough and falling
    if (enemyFeet <= groundHeight + 0.3 && this.velocity.y <= 0) {
      this.mesh.position.y = groundHeight + 1;
      this.velocity.y = 0;
      this.isOnGround = true;
    }

    // Minimum height
    if (this.mesh.position.y < 1) {
      this.mesh.position.y = 1;
      this.velocity.y = 0;
      this.isOnGround = true;
    }

    // Attack player if close AND has line of sight
    if (distance < 2.5 && Date.now() - this.lastAttackTime > 1000) {
      // Check line of sight before attacking
      if (this.hasLineOfSight(playerPos)) {
        this.lastAttackTime = Date.now();
        return true; // Signal attack
      }
    }
    return false;
  }

  // Check if enemy can see the player (no obstacles blocking)
  hasLineOfSight(playerPos) {
    const enemyEyePos = this.mesh.position.clone();
    enemyEyePos.y += 0.5; // Eye level
    
    const playerCenter = playerPos.clone();
    playerCenter.y -= 0.5; // Aim at player body center
    
    const direction = new THREE.Vector3().subVectors(playerCenter, enemyEyePos);
    const distance = direction.length();
    direction.normalize();
    
    // Check against all non-ground colliders
    for (const col of colliders) {
      if (col.isGround) continue;
      
      // Simple ray-box intersection
      const hit = this.rayIntersectsBox(enemyEyePos, direction, col.min, col.max, distance);
      if (hit) {
        return false; // Blocked by obstacle
      }
    }
    return true; // Clear line of sight
  }

  // Ray-AABB intersection test
  rayIntersectsBox(origin, dir, boxMin, boxMax, maxDist) {
    let tmin = 0;
    let tmax = maxDist;
    
    for (let i = 0; i < 3; i++) {
      const axis = ['x', 'y', 'z'][i];
      const invD = 1 / dir[axis];
      let t0 = (boxMin[axis] - origin[axis]) * invD;
      let t1 = (boxMax[axis] - origin[axis]) * invD;
      
      if (invD < 0) {
        const temp = t0;
        t0 = t1;
        t1 = temp;
      }
      
      tmin = Math.max(tmin, t0);
      tmax = Math.min(tmax, t1);
      
      if (tmax < tmin) return false;
    }
    return true;
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

// Rocket launcher
function fireRocket() {
  if (Date.now() - lastRocketTime < ROCKET_COOLDOWN) return;
  lastRocketTime = Date.now();
  
  // Create rocket mesh
  const rocketGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.6, 8);
  rocketGeo.rotateX(Math.PI / 2);
  const rocketMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x331100 });
  const rocket = new THREE.Mesh(rocketGeo, rocketMat);
  
  // Position at camera
  rocket.position.copy(camera.position);
  
  // Get direction camera is facing
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  rocket.velocity = direction.multiplyScalar(ROCKET_SPEED);
  rocket.lookAt(rocket.position.clone().add(rocket.velocity));
  
  scene.add(rocket);
  rockets.push(rocket);
}

// Explosion effect
function createExplosion(position) {
  // Visual explosion
  const explosionGeo = new THREE.SphereGeometry(1, 16, 16);
  const explosionMat = new THREE.MeshBasicMaterial({ 
    color: 0xff6600, 
    transparent: true, 
    opacity: 0.8 
  });
  const explosion = new THREE.Mesh(explosionGeo, explosionMat);
  explosion.position.copy(position);
  explosion.scale.set(0.1, 0.1, 0.1);
  explosion.life = 0.5;
  scene.add(explosion);
  explosions.push(explosion);
  
  // Damage enemies in radius
  for (const enemy of enemies) {
    if (enemy.health <= 0) continue;
    const dist = enemy.mesh.position.distanceTo(position);
    if (dist < EXPLOSION_RADIUS) {
      const damage = ROCKET_DAMAGE * (1 - dist / EXPLOSION_RADIUS);
      const killed = enemy.takeDamage(damage);
      createBlood(enemy.mesh.position.clone());
      
      if (killed) {
        score += 100;
        updateScoreDisplay();
        if (Math.random() < 0.3) {
          createPickup(enemy.mesh.position.clone(), Math.random() < 0.5 ? 'health' : 'ammo');
        }
        enemy.destroy();
      }
    }
  }
}

// Update rockets
function updateRockets(delta) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rocket = rockets[i];
    const movement = rocket.velocity.clone().multiplyScalar(delta);
    rocket.position.add(movement);
    
    // Check collision with environment
    let hitEnvironment = false;
    for (const col of colliders) {
      if (rocket.position.x > col.min.x && rocket.position.x < col.max.x &&
          rocket.position.y > col.min.y && rocket.position.y < col.max.y &&
          rocket.position.z > col.min.z && rocket.position.z < col.max.z) {
        hitEnvironment = true;
        break;
      }
    }
    
    // Check collision with enemies
    let hitEnemy = false;
    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      if (rocket.position.distanceTo(enemy.mesh.position) < 1.5) {
        hitEnemy = true;
        break;
      }
    }
    
    // Explode on hit or max distance
    if (hitEnvironment || hitEnemy || rocket.position.distanceTo(camera.position) > 200) {
      createExplosion(rocket.position.clone());
      scene.remove(rocket);
      rockets.splice(i, 1);
    }
  }
}

// Update explosions
function updateExplosions(delta) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const exp = explosions[i];
    exp.life -= delta * 2;
    exp.scale.multiplyScalar(1.15);
    exp.material.opacity = exp.life;
    
    if (exp.life <= 0) {
      scene.remove(exp);
      explosions.splice(i, 1);
    }
  }
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

  // Jump (with double jump)
  if (keys.space) {
    if (isOnGround) {
      playerVelocity.y = JUMP_FORCE;
      isOnGround = false;
      canDoubleJump = true;
    } else if (canDoubleJump) {
      playerVelocity.y = JUMP_FORCE;
      canDoubleJump = false;
    }
    keys.space = false; // Consume the input to prevent held-space issues
  }

  // Gravity
  playerVelocity.y -= GRAVITY * delta;

  // Try to move X (skip ramps in collision check)
  const newX = camera.position.x + playerVelocity.x * delta;
  if (!checkCollision(newX, camera.position.y, camera.position.z, true)) {
    camera.position.x = newX;
  } else {
    playerVelocity.x = 0;
  }

  // Try to move Z (skip ramps in collision check)
  const newZ = camera.position.z + playerVelocity.z * delta;
  if (!checkCollision(camera.position.x, camera.position.y, newZ, true)) {
    camera.position.z = newZ;
  } else {
    playerVelocity.z = 0;
  }

  // Check ground height (for ramps)
  const groundHeight = getGroundHeight(camera.position.x, camera.position.z);
  const playerFeet = camera.position.y - PLAYER_HEIGHT;
  
  // If we're on or near the ground/ramp surface, snap to it
  if (playerFeet <= groundHeight + 0.5 && playerVelocity.y <= 0) {
    camera.position.y = groundHeight + PLAYER_HEIGHT;
    playerVelocity.y = 0;
    isOnGround = true;
  } else {
    // Try to move Y (in air)
    const newY = camera.position.y + playerVelocity.y * delta;
    const colY = checkCollision(camera.position.x, newY, camera.position.z, true);
    if (!colY) {
      camera.position.y = newY;
      // Check if we've landed on something
      const newGroundHeight = getGroundHeight(camera.position.x, camera.position.z);
      if (camera.position.y - PLAYER_HEIGHT <= newGroundHeight) {
        camera.position.y = newGroundHeight + PLAYER_HEIGHT;
        playerVelocity.y = 0;
        isOnGround = true;
      } else {
        isOnGround = false;
      }
    } else {
      // Hit ceiling or landed on platform
      if (playerVelocity.y < 0) {
        camera.position.y = colY.max.y + PLAYER_HEIGHT;
        isOnGround = true;
      }
      playerVelocity.y = 0;
    }
  }

  // Minimum height (standing on ground level 0)
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
        showPickupText('+25 HEALTH', 'health');
      } else {
        reserveAmmo = Math.min(MAX_RESERVE, reserveAmmo + 15);
        updateAmmoDisplay();
        showPickupText('+15 AMMO', 'ammo');
      }
      scene.remove(pickup);
      pickups.splice(i, 1);
    }
  }
}

// Show pickup notification text
function showPickupText(text, type) {
  const container = document.getElementById('pickup-notifications');
  const div = document.createElement('div');
  div.className = `pickup-text ${type}`;
  div.textContent = text;
  container.appendChild(div);
  
  // Remove after animation completes
  setTimeout(() => {
    div.remove();
  }, 1500);
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
  
  // Clear rockets and explosions
  for (const rocket of rockets) {
    scene.remove(rocket);
  }
  rockets.length = 0;
  for (const exp of explosions) {
    scene.remove(exp);
  }
  explosions.length = 0;
  
  // Reset player
  camera.position.set(0, PLAYER_HEIGHT, 0);
  playerVelocity.set(0, 0, 0);
  yaw = 0;
  pitch = 0;
  canDoubleJump = false;
  
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
    mouse.leftDown = true;
    if (!gameStarted) {
      startGame();
    } else if (gameOver) {
      restartGame();
      document.body.requestPointerLock();
    }
  }
  if (e.button === 2) {
    mouse.rightDown = true;
    if (gameStarted && !gameOver && mouse.locked) {
      fireRocket();
    }
  }
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.leftDown = false;
  if (e.button === 2) mouse.rightDown = false;
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault(); // Prevent right-click menu
});

document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement !== null;
  if (!mouse.locked) {
    mouse.leftDown = false;
    mouse.rightDown = false;
  }
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
    // Handle held left click for continuous shooting
    if (mouse.leftDown && mouse.locked) {
      shoot();
    }
    
    updatePlayer(delta);
    updateEnemies(delta);
    updateBlood(delta);
    updateBullets(delta);
    updateRockets(delta);
    updateExplosions(delta);
    updatePickups(delta);
  }
  
  renderer.render(scene, camera);
}

animate();
