/* Make -> models, for the booking form's vehicle picker.
 *
 * Deliberately a static file rather than a live API call. It costs nothing, works
 * offline, never rate-limits, adds no third party to the CSP, and sends nothing about
 * the customer to anyone. Trim levels are not here on purpose — for pricing a detail,
 * make + model + size is all that matters.
 *
 * Missing something? Add it to the list. Customers can also pick "Other" and type it. */
window.VEHICLES = {
  "Acura": ["ILX","Integra","MDX","RDX","RLX","TL","TLX","TSX","ZDX"],
  "Alfa Romeo": ["Giulia","Stelvio","Tonale"],
  "Audi": ["A3","A4","A5","A6","A7","A8","e-tron","Q3","Q5","Q7","Q8","S4","S5","TT"],
  "BMW": ["2 Series","3 Series","4 Series","5 Series","7 Series","8 Series","i4","iX","M3","M4","X1","X2","X3","X4","X5","X6","X7","Z4"],
  "Buick": ["Enclave","Encore","Encore GX","Envision","Envista","LaCrosse","Regal"],
  "Cadillac": ["ATS","CT4","CT5","CTS","Escalade","LYRIQ","SRX","XT4","XT5","XT6","XTS"],
  "Chevrolet": ["Blazer","Bolt","Camaro","Colorado","Corvette","Cruze","Equinox","Impala","Malibu","Silverado 1500","Silverado 2500","Sonic","Spark","Suburban","Tahoe","Trailblazer","Traverse","Trax"],
  "Chrysler": ["300","Pacifica","Voyager"],
  "Dodge": ["Challenger","Charger","Durango","Grand Caravan","Hornet","Journey"],
  "Fiat": ["500","500X"],
  "Ford": ["Bronco","Bronco Sport","EcoSport","Edge","Escape","Expedition","Explorer","F-150","F-250","Fiesta","Focus","Fusion","Maverick","Mustang","Mustang Mach-E","Ranger","Transit","Transit Connect"],
  "Genesis": ["G70","G80","G90","GV70","GV80"],
  "GMC": ["Acadia","Canyon","Hummer EV","Sierra 1500","Sierra 2500","Terrain","Yukon","Yukon XL"],
  "Honda": ["Accord","Civic","CR-V","CR-Z","Element","Fit","HR-V","Insight","Odyssey","Passport","Pilot","Prologue","Ridgeline"],
  "Hyundai": ["Accent","Elantra","Ioniq 5","Ioniq 6","Kona","Palisade","Santa Cruz","Santa Fe","Sonata","Tucson","Veloster","Venue"],
  "Infiniti": ["Q50","Q60","QX50","QX55","QX60","QX80"],
  "Jaguar": ["E-Pace","F-Pace","F-Type","I-Pace","XE","XF"],
  "Jeep": ["Cherokee","Compass","Gladiator","Grand Cherokee","Grand Wagoneer","Patriot","Renegade","Wagoneer","Wrangler"],
  "Kia": ["Carnival","EV6","EV9","Forte","K5","Niro","Optima","Rio","Sedona","Seltos","Sorento","Soul","Sportage","Stinger","Telluride"],
  "Land Rover": ["Defender","Discovery","Discovery Sport","Range Rover","Range Rover Evoque","Range Rover Sport","Range Rover Velar"],
  "Lexus": ["ES","GS","GX","IS","LS","LX","NX","RC","RX","TX","UX"],
  "Lincoln": ["Aviator","Corsair","Nautilus","Navigator","MKC","MKZ"],
  "Maserati": ["Ghibli","Grecale","Levante","Quattroporte"],
  "Mazda": ["CX-30","CX-5","CX-50","CX-9","CX-90","Mazda3","Mazda6","MX-5 Miata"],
  "Mercedes-Benz": ["A-Class","C-Class","CLA","E-Class","EQB","EQE","EQS","G-Class","GLA","GLB","GLC","GLE","GLS","S-Class","Sprinter"],
  "MINI": ["Clubman","Countryman","Hardtop"],
  "Mitsubishi": ["Eclipse Cross","Mirage","Outlander","Outlander Sport"],
  "Nissan": ["Altima","Ariya","Armada","Frontier","Kicks","Leaf","Maxima","Murano","Pathfinder","Rogue","Sentra","Titan","Versa","Z"],
  "Polestar": ["Polestar 2","Polestar 3"],
  "Porsche": ["718 Boxster","718 Cayman","911","Cayenne","Macan","Panamera","Taycan"],
  "Ram": ["1500","2500","3500","ProMaster"],
  "Rivian": ["R1S","R1T"],
  "Subaru": ["Ascent","BRZ","Crosstrek","Forester","Impreza","Legacy","Outback","Solterra","WRX"],
  "Tesla": ["Cybertruck","Model 3","Model S","Model X","Model Y"],
  "Toyota": ["4Runner","Avalon","bZ4X","Camry","Corolla","Corolla Cross","Crown","Grand Highlander","Highlander","Prius","RAV4","Sequoia","Sienna","Tacoma","Tundra","Venza"],
  "Volkswagen": ["Atlas","Atlas Cross Sport","Golf","GTI","ID.4","Jetta","Passat","Taos","Tiguan"],
  "Volvo": ["C40","S60","S90","V60","V90","XC40","XC60","XC90"],
  "Other": []
};

/* Towns we actually cover. Same list as the Service Area section — keep them in step.
 * A dropdown instead of a free-text box means nobody books from Stamford by accident. */
window.TOWNS = {
  "New Haven County": ["New Haven","Hamden","Milford","West Haven","East Haven","North Haven","Branford","Guilford","Orange","Woodbridge","Cheshire","Wallingford","Meriden"],
  "Naugatuck Valley": ["Shelton","Ansonia","Derby","Seymour","Oxford","Beacon Falls","Naugatuck","Waterbury"],
  "Central & Hartford County": ["Hartford","West Hartford","New Britain","Berlin","Southington","Plainville","Newington","Wethersfield","Rocky Hill","Cromwell","Middletown","Farmington","Glastonbury"]
};
