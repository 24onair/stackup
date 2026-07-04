// physics.js — Matter.js 월드 구성, 칩 팩토리, 동결/무게중심/전도·바닥 판정
/* global Matter */

// ─── 물리 튜닝 상수 (모두 시작값 — 여기서 조정) ─────────────
export const P = {
  W: 750, H: 1334,            // 논리 캔버스
  CHIP_W: 92, CHIP_H: 72,     // 칩 크기(px) — 색면 50 + 라벨 22 (칩칩 가이드)
  GRAVITY_Y: 1.2,
  FRICTION: 0.8,
  FRICTION_STATIC: 1.0,
  RESTITUTION: 0.05,
  DENSITY: 0.002,
  FRICTION_AIR: 0.02,
  SLOP: 0.02,
  POSITION_ITER: 10,
  VELOCITY_ITER: 8,
  STEP_MS: 1000 / 60,

  PLATFORM_W: 240, PLATFORM_H: 36,
  PLATFORM_TOP_Y: 1100,       // 플랫폼 윗면의 월드 y
  FLOOR_Y: 1284,              // 바닥 라인 y

  FREEZE_DEPTH: 8,            // 위로 K칩 쌓이면 동결 대상
  SLEEP_SPEED: 0.05,          // 동결 전 요건: 이 속도 미만 + 각도 정착
  SLEEP_ANGLE_DEG: 5,

  TOPPLE_ANGLE_DEG: 35,       // 전도 판정 각
  TOPPLE_HOLD_MS: 500,        // 그 각을 지속해야 하는 시간
  SETTLE_SPEED: 0.15,         // 안착 게이트: 속도
  SETTLE_ANGVEL: 0.02,        //             각속도
  SETTLE_FRAMES: 20,          //             연속 프레임
  SETTLE_TIMEOUT_MS: 2500,
  KILL_Y: 1600,               // 안전망: 이보다 아래로 가면 바닥 취급
};

const { Engine, Bodies, Body, Composite, Events } = Matter;

export function createWorld() {
  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: P.POSITION_ITER,
    velocityIterations: P.VELOCITY_ITER,
  });
  engine.gravity.y = P.GRAVITY_Y;

  const platform = Bodies.rectangle(
    P.W / 2, P.PLATFORM_TOP_Y + P.PLATFORM_H / 2, P.PLATFORM_W, P.PLATFORM_H,
    { isStatic: true, friction: P.FRICTION, label: 'platform' },
  );
  // 바닥 센서: 전체 폭(넉넉히 5000) — 닿는 순간 미스 판정
  const floorSensor = Bodies.rectangle(
    P.W / 2, P.FLOOR_Y + 24, 5000, 48,
    { isStatic: true, isSensor: true, label: 'floorSensor' },
  );
  Composite.add(engine.world, [platform, floorSensor]);
  return { engine, platform, floorSensor };
}

export function makeChipBody(x, y) {
  return Bodies.rectangle(x, y, P.CHIP_W, P.CHIP_H, {
    friction: P.FRICTION,
    frictionStatic: P.FRICTION_STATIC,
    restitution: P.RESTITUTION,
    density: P.DENSITY,
    frictionAir: P.FRICTION_AIR,
    slop: P.SLOP,
    label: 'chip',
  });
}

/** 바닥 센서 접촉 감지 등록 — onFloorHit(chipBody) 콜백 */
export function onFloorContact(engine, floorSensor, onFloorHit) {
  Events.on(engine, 'collisionStart', (ev) => {
    for (const pair of ev.pairs) {
      const other = pair.bodyA === floorSensor ? pair.bodyB
                  : pair.bodyB === floorSensor ? pair.bodyA : null;
      if (other && other.label === 'chip') onFloorHit(other);
    }
  });
}

/** 90° 배수로부터의 각도 편차(도) */
export function angleDeviationDeg(body) {
  const deg = (body.angle * 180 / Math.PI) % 90;
  const d = ((deg % 90) + 90) % 90;
  return Math.min(d, 90 - d);
}

/** 동결 요건: 거의 정지 + 각도 정착 (혹은 Matter sleep) */
export function isRestful(body) {
  return body.isSleeping ||
    (body.speed < P.SLEEP_SPEED && Math.abs(body.angularSpeed) < P.SLEEP_SPEED
      && angleDeviationDeg(body) < P.SLEEP_ANGLE_DEG);
}

/**
 * 동결 스텝: 아래에서부터, 위로 FREEZE_DEPTH칩 이상 쌓였고 정지 상태인 칩을
 * 착지 1회당 최대 1개 static으로 전환. chips = 착지 순 배열 [{body, frozen, ...}]
 */
export function freezeStep(chips) {
  for (let i = 0; i < chips.length; i++) {
    const c = chips[i];
    if (c.frozen || c.fallen) continue;
    if (chips.length - 1 - i < P.FREEZE_DEPTH) break; // 위 칩 수 부족 — 더 위도 마찬가지
    if (isRestful(c.body)) {
      Body.setStatic(c.body, true);
      c.frozen = true;
      return c;
    }
    break; // 가장 아래 활성 칩이 안 자면 순서 유지 위해 중단
  }
  return null;
}

/** 활성(비동결·비전도) 칩들의 질량가중 무게중심 x와 지지대 정보.
 *  지지대 = 가장 높은 동결 칩(없으면 플랫폼). 동결 시스템과 인디케이터가 항상 일치. */
export function computeSupport(chips) {
  let mass = 0, mx = 0, topY = Infinity;
  let supportX = P.W / 2, supportHalf = P.PLATFORM_W / 2, supportTopY = P.PLATFORM_TOP_Y;
  let bestFrozenY = Infinity;
  for (const c of chips) {
    if (c.fallen) continue;
    if (c.frozen) {
      if (c.body.position.y < bestFrozenY) {
        bestFrozenY = c.body.position.y;
        supportX = c.body.position.x;
        supportHalf = P.CHIP_W / 2;
        supportTopY = c.body.position.y - P.CHIP_H / 2;
      }
      continue;
    }
    const m = c.body.mass;
    mass += m; mx += c.body.position.x * m;
    topY = Math.min(topY, c.body.position.y - P.CHIP_H / 2);
  }
  if (mass === 0) return null;
  const comX = mx / mass;
  return {
    comX,
    towerTopY: topY,
    supportX,
    supportHalf,
    supportTopY,
    // 0 = 완전 중앙, 1 = 지지폭 끝
    ratio: Math.min(2, Math.abs(comX - supportX) / supportHalf),
  };
}

/** 타워 최상단 y (칩 없으면 플랫폼 윗면) */
export function towerTopY(chips) {
  let top = P.PLATFORM_TOP_Y;
  for (const c of chips) {
    if (c.fallen) continue;
    top = Math.min(top, c.body.position.y - P.CHIP_H / 2);
  }
  return top;
}

/**
 * 전도 타이머 갱신. 반환: {fallenCount, topFallen, anyDanger}
 * fallen 판정: 35° 초과 500ms 지속, 또는 두 칸 아래 칩 높이 이하로 추락, 또는 KILL_Y 초과.
 */
export function updateToppleState(chips, dtMs) {
  let fallenCount = 0, anyDanger = false;
  chips.forEach((c, i) => {
    if (c.frozen) { c.fallenMs = 0; return; }
    const dev = angleDeviationDeg(c.body);
    // 바로 아래 칩과 같은 높이(이하)로 내려앉음 = 스택에서 미끄러져 이탈
    const below = i >= 1 && !chips[i - 1].fallen ? chips[i - 1] : null;
    const slidDown = below && c.body.position.y > below.body.position.y - 4;
    if (dev > P.TOPPLE_ANGLE_DEG || slidDown) {
      c.fallenMs = (c.fallenMs || 0) + dtMs;
    } else {
      c.fallenMs = 0;
    }
    if (dev > 20 && dev <= P.TOPPLE_ANGLE_DEG) anyDanger = true;
    if (c.body.position.y > P.KILL_Y) c.fallenMs = P.TOPPLE_HOLD_MS + 1;
    c.fallen = (c.fallenMs || 0) > P.TOPPLE_HOLD_MS;
    if (c.fallen) fallenCount++;
  });
  const top = chips[chips.length - 1];
  return { fallenCount, topFallen: !!(top && top.fallen), anyDanger };
}
