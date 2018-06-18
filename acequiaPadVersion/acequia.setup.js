if (!window.hasStartup) {
  console.log('this', this);

  this.PUBLISH_TO_FB = true;
  this.MAX_Z = 30;
  this.MIN_Z = 1;
  this.SHAPES = ['👽', '👾', '🤖', '👁', '🛰️', '🦂'];
  this.CENTER_LAT = 35.682991;
  this.LAT_HEIGHT = 0.1;
  this.CENTER_LON = -105.94868;
  this.LON_WIDTH = 0.1;

  String.prototype.insert = function(index, string) {
    if (index > 0)
      return (
        this.substring(0, index) + string + this.substring(index, this.length)
      );
    else return string + this;
  };

  if (!this.fbRootRef) {
    this.fbRootRef = firebase
      .initializeApp(
        {
          apiKey: 'AIzaSyBI-Js8EBS6pe2GmTG0IGpxgeIbtGJkbIA',
          databaseURL: 'https://livetexture.firebaseio.com',
          authDomain: 'livetexture.firebaseapp.com',
          projectId: 'firebase-livetexture',
        },
        'livetexture'
      )
      .database();
  }
  this.spaceShipRef = this.fbRootRef.ref().child('spaceships2');
  this.setVision = vision => {
    this.vision = vision;
    this.patches.cacheRect(vision);
  };

  this.setMaxTurn = maxTurnDegrees => {
    this.maxTurn = util.radians(maxTurnDegrees);
  };
  this.hasStartup = true;

  this.publishToFirebase = () => {
    let features = {
      type: 'FeatureCollection',
      features: [],
    };
    this.turtles.forEach(a => {
      let lat = (this.LAT_HEIGHT * a.y) / this.world.height + this.CENTER_LAT;
      let lon = (this.LON_WIDTH * a.x) / this.world.width + this.CENTER_LON;
      let color = a.color.getCss();
      let title = a.title;
      if (a.onMission) title = `📸${title}📸`;
      if (color.length < 5) {
        // make sure it is a 6 digit color, for geojson
        color = color
          .insert(4, '0')
          .insert(3, '0')
          .insert(2, '0');
      }
      let feat = {
        type: 'Feature',
        properties: {
          title: title,
          stroke: color,
          fill: color,
        },
        geometry: {
          type: 'Point',
          coordinates: [lon, lat, 2000 + a.z * 100],
        },
      };
      if (a.onMission) {
        feat.properties.onMission = true;
      }
      features.features.push(feat);
    });
    this.spaceShipRef.set(features);
  };

  this.howManyOnMission = () => {
    let count = 0;
    this.turtles.ask(t => {
      if (t.onMission) count++;
    });
    return count;
  };

  this.doMission = a => {
    let dest = { x: a.missionDestiantion[0], y: a.missionDestiantion[1] };
    const theta = a.towards(dest);
    this.turnTowards(a, theta, Math.PI / 20);
    a.z = 4;
    if (a.distance(dest) > 0.5) {
      a.forward(a.speed * this.dt);
    } else {
      var now = new Date().getTime();
      if (now - a.missionStart > this.missionDuration) {
        a.onMission = false;
        a.missionDestiantion = [0, 0];
        a.missionStart = 0;
      }
    }
  };

  this.sendOnMission = a => {
    a.onMission = true;
    let x = Math.random() * this.world.width + this.world.minX;
    let y = Math.random() * this.world.height + this.world.minY;
    a.missionDestiantion = [x, y];
    a.missionStart =
      new Date().getTime() + (Math.random() * this.missionDuration) / 4;
  };

  this.flock = a => {
    // a is turtle
    // flockmates = this.turtles.inRadius(a, this.vision).other(a)
    const flockmates = this.turtles.inRadius(a, this.vision, false);
    // flockmates = a.inRadius(this.turtles, this.vision, false)
    if (this.farFromCenter(a)) {
      const theta = a.towards({ x: 0, y: 0 });
      this.turnTowards(a, theta, Math.PI / 20);
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
    a.forward(a.speed * this.dt);
  };
  //
  // Figure out Z
  //
  this.findHeight = a => {
    let d = Math.hypot(a.x - this.world.centerX, a.y - this.world.centerY);
    d = d / (this.circleRadius * 2);
    // aproximate the funnel shape we want with a sin function. This could be any shape
    let chosenZ = Math.sin(d * (Math.PI / 2)) * this.MAX_Z + this.MIN_Z;
    chosenZ = Math.max(1, chosenZ);
    // use hookes spring law to make them atracted to the funnel
    let disp = chosenZ - a.z; // displacement
    const springK = 0.3;
    const resistanceK = 0.1;
    const dt = this.dt;
    const resistance = -a.dz * resistanceK; // resistance, goes in oppisite direction as motion.
    let F = springK * disp + resistance; // Force = k*d - r
    a.dz += F * dt;
    // add a little fluctuation
    if (Math.random() > 0.9 && a.z < this.MAX_Z) {
      a.dz = a.dz + Math.random() * 0.1;
    }
    a.z = a.z + a.dz * dt;
  };

  this.separate = (a, nearest) => {
    const theta = nearest.towards(a);
    this.turnTowards(a, theta);
  };

  this.inBounds = a => {
    return (
      a.x < this.world.minX + 1 ||
      a.x > this.world.maxX - 1 ||
      a.y < this.world.minY + 1 ||
      a.y > this.world.maxY - 1
    );
  };

  this.farFromCenter = (a, maxD) => {
    maxD = maxD || this.circleRadius;
    let d = Math.hypot(a.x - this.world.centerX, a.y - this.world.centerY);
    return d > this.circleRadius;
  };

  this.align = (a, flockmates) => {
    this.turnTowards(a, this.averageHeading(flockmates));
  };

  this.cohere = (a, flockmates) => {
    this.turnTowards(a, this.averageHeadingTowards(a, flockmates));
  };

  this.turnTowards = (a, theta, max = this.maxTurn) => {
    let turn = util.subtractRadians(theta, a.theta); // angle from h to a
    turn = util.clamp(turn, -max, max); // limit the turn
    a.rotate(turn);
  };

  this.averageHeading = flockmates => {
    const thetas = flockmates.map(f => f.theta);
    const dx = thetas.map(t => Math.cos(t)).reduce((x, y) => x + y);
    const dy = thetas.map(t => Math.sin(t)).reduce((x, y) => x + y);
    return Math.atan2(dy, dx);
  };

  this.averageHeadingTowards = (a, flockmates) => {
    const towards = flockmates.map(f => f.towards(a));
    const dx = towards.map(t => Math.cos(t)).reduce((x, y) => x + y);
    const dy = towards.map(t => Math.sin(t)).reduce((x, y) => x + y);
    return Math.atan2(dy, dx);
  };

  // headingsOf (boids) { return boids.map((t) => t.theta) }
  this.reportFlockVectorSize = () => {
    const headings = this.turtles.map(t => t.theta);
    const dx = headings.map(theta => Math.cos(theta)).reduce((x, y) => x + y);
    const dy = headings.map(theta => Math.sin(theta)).reduce((x, y) => x + y);
    return Math.sqrt(dx * dx + dy * dy) / this.population;
  };
}

this.circleRadius = 12; // model coords
this.dt = 0.02;
this.MAX_MISSIONARIES = 4;
this.missionDuration = 4 * 60 * 1000;

this.turtles.setDefault('atEdge', 'wrap');
this.turtles.setDefault('z', this.MAX_Z);
this.turtles.setDefault('dz', -0.1);
this.turtles.setDefault('size', 10);
this.turtles.setDefault('speed', 1);

const cmap = ColorMap.grayColorMap(0, 100);
this.patches.ask(p => {
  p.setColor(cmap.randomColor());
});

this.refreshPatches = false;
this.setMaxTurn(3.0);
this.setVision(5);
this.minSeparation = 0.05;
// this.anim.setRate(30)
this.population = 30; // 300 // 1e4 this.patches.length
util.repeat(this.population, () => {
  this.patches.oneOf().sprout();
});
this.turtles.forEach(a => {
  const title = this.SHAPES[Math.floor(this.SHAPES.length * Math.random())];
  console.log(title);
  a.title = title;
  a.onMission = false;
  a.missionStart = 0;
  a.missionDestiantion = [0, 0];
});
this.turtles[0].title = 'SFI';
this.turtles[1].title = '🐉';
