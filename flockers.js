import {
  util,
  ColorMap,
  Model
} from "./node_modules/@redfish/as-app3d/docs/dist/as-app3d.esm.js";

const PUBLISH_TO_FB = true;
const MAX_Z = 11;
const MIN_Z = 1;
let SHAPES = ["👽", "👾", "🤖", "🛸", "🛰️", "🦂"];

String.prototype.insert = function(index, string) {
  if (index > 0)
    return (
      this.substring(0, index) + string + this.substring(index, this.length)
    );
  else return string + this;
};

util.toWindow({ ColorMap, Model, util });
var spaceShipRef = fbRootRef.ref().child("spaceships2");

class FlockModel extends Model {
  setVision(vision) {
    this.vision = vision;
    this.patches.cacheRect(vision);
  }
  setMaxTurn(maxTurnDegrees) {
    this.maxTurn = util.radians(maxTurnDegrees);
  }
  setup() {
    // console.log('firebase', firebase)
    this.turtles.setDefault("atEdge", "wrap");
    this.turtles.setDefault("z", MAX_Z);
    this.turtles.setDefault("dz", -0.1);
    this.turtles.setDefault("size", 1);
    this.turtles.setDefault("speed", 0.01);

    const cmap = ColorMap.grayColorMap(0, 100);
    this.patches.ask(p => {
      p.setColor(cmap.randomColor());
    });

    this.refreshPatches = false;
    this.setMaxTurn(3.0);
    this.setVision(5);
    this.minSeparation = 0.75;
    // this.anim.setRate(30)
    this.population = 30; // 300 // 1e4 this.patches.length
    util.repeat(this.population, () => {
      this.patches.oneOf().sprout();
    });
    this.turtles.forEach(a => {
      const title = SHAPES[Math.floor(SHAPES.length * Math.random())];
      console.log(title);
      a.title = title;
    });
  }

  publishToFirebase() {
    let features = {
      type: "FeatureCollection",
      features: []
    };
    this.turtles.forEach(a => {
      let lat = a.y / 800 + 35.6653334;
      let lon = a.x / 800 - 105.9632124;
      let color = a.color.getCss();
      if (color.length < 5) {
        // make sure it is a 6 digit color, for geojson
        color = color
          .insert(4, "0")
          .insert(3, "0")
          .insert(2, "0");
      }
      let feat = {
        type: "Feature",
        properties: {
          title: a.title,
          stroke: color,
          fill: color
        },
        geometry: {
          type: "Point",
          coordinates: [lon, lat, 2000 + a.z * 100]
        }
      };
      features.features.push(feat);
    });
    spaceShipRef.set(features);
  }

  step() {
    this.turtles.ask(t => {
      this.flock(t);
    });
    if (PUBLISH_TO_FB && this.anim.ticks % 100 == 0) {
      this.publishToFirebase();
    }
  }
  flock(a) {
    // a is turtle
    // flockmates = this.turtles.inRadius(a, this.vision).other(a)
    const flockmates = this.turtles.inRadius(a, this.vision, false);
    // flockmates = a.inRadius(this.turtles, this.vision, false)
    if (this.inBounds(a) || this.farFromCenter(a)) {
      const theta = a.towards({ x: 0, y: 0 });
      this.turnTowards(a, theta, Math.PI / 10);
    } else if (flockmates.length !== 0) {
      // REMIND: distanceSq or manhattan distance
      const nearest = flockmates.minOneOf(f => f.distance(a));
      if (a.distance(nearest) < this.minSeparation) {
        this.separate(a, nearest);
      } else {
        this.align(a, flockmates);
        this.cohere(a, flockmates);
      }
    }
    a.forward(a.speed);
    //
    // Figure out Z
    //
    let d = Math.hypot(a.x - this.world.centerX, a.y - this.world.centerY);
    d = d / this.world.width;
    // aproximate the funnel shape we want with a sin function. This could be any shape
    const chosenZ = Math.sin(d * (Math.PI / 2)) * MAX_Z + MIN_Z;
    // use hookes spring law to make them atracted to the funnel
    let disp = chosenZ - a.z; // displacement
    const springK = 0.3;
    const resistanceK = 0.1;
    const dt = 0.02;
    const resistance = -a.dz * resistanceK; // resistance, goes in oppisite direction as motion.
    let F = springK * disp + resistance; // Force = k*d - r
    a.dz += F * dt;
    // add a little fluctuation
    if (Math.random() > 0.9 && a.z < MAX_Z) {
      a.dz = a.dz + Math.random() * 0.2;
    }
    a.z = a.z + a.dz * dt;
  }
  separate(a, nearest) {
    const theta = nearest.towards(a);
    this.turnTowards(a, theta);
  }
  inBounds(a) {
    return (
      a.x < this.world.minX + 1 ||
      a.x > this.world.maxX - 1 ||
      a.y < this.world.minY + 1 ||
      a.y > this.world.maxY - 1
    );
  }
  farFromCenter(a) {
    let d = Math.hypot(a.x - this.world.centerX, a.y - this.world.centerY);
    return d > this.world.width / 2 - 2;
  }
  align(a, flockmates) {
    this.turnTowards(a, this.averageHeading(flockmates));
  }
  cohere(a, flockmates) {
    this.turnTowards(a, this.averageHeadingTowards(a, flockmates));
  }
  turnTowards(a, theta, max = this.maxTurn) {
    let turn = util.subtractRadians(theta, a.theta); // angle from h to a
    turn = util.clamp(turn, -max, max); // limit the turn
    a.rotate(turn);
  }
  averageHeading(flockmates) {
    const thetas = flockmates.map(f => f.theta);
    const dx = thetas.map(t => Math.cos(t)).reduce((x, y) => x + y);
    const dy = thetas.map(t => Math.sin(t)).reduce((x, y) => x + y);
    return Math.atan2(dy, dx);
  }
  averageHeadingTowards(a, flockmates) {
    const towards = flockmates.map(f => f.towards(a));
    const dx = towards.map(t => Math.cos(t)).reduce((x, y) => x + y);
    const dy = towards.map(t => Math.sin(t)).reduce((x, y) => x + y);
    return Math.atan2(dy, dx);
  }

  // headingsOf (boids) { return boids.map((t) => t.theta) }
  reportFlockVectorSize() {
    const headings = this.turtles.map(t => t.theta);
    const dx = headings.map(theta => Math.cos(theta)).reduce((x, y) => x + y);
    const dy = headings.map(theta => Math.sin(theta)).reduce((x, y) => x + y);
    return Math.sqrt(dx * dx + dy * dy) / this.population;
  }
}

const model = new FlockModel();
model.setup();
model.start();

// Debugging
console.log("patches:", model.patches.length);
console.log("turtles:", model.turtles.length);
const { world, patches, turtles } = model;
util.toWindow({ world, patches, turtles, model });
