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

/* Exotic and luxury marques, kept in their own list so the main dropdown stays short.
 * These get a Trim field as well — on a 911 or an AMG the trim genuinely changes the job
 * (carbon aero, ceramic brakes, Alcantara, PPF already on the car), which is not true of
 * a Camry. Merged into the make list at load time. */
window.EXOTICS = {
  "Aston Martin": ["DB11","DB12","DBS","DBX","Vantage","Vanquish"],
  "Bentley": ["Bentayga","Continental GT","Flying Spur","Mulsanne"],
  "Bugatti": ["Chiron","Mistral","Tourbillon","Veyron"],
  "Ferrari": ["296 GTB","488","812 Superfast","F8 Tributo","Portofino","Purosangue","Roma","SF90"],
  "Ford (Performance)": ["GT","Mustang Shelby GT350","Mustang Shelby GT500"],
  "Koenigsegg": ["Gemera","Jesko","Regera"],
  "Lamborghini": ["Aventador","Gallardo","Huracan","Revuelto","Temerario","Urus"],
  "Lotus": ["Elise","Emira","Eletre","Evora","Exige"],
  "McLaren": ["570S","720S","750S","Artura","GT","P1","Senna"],
  "Pagani": ["Huayra","Utopia","Zonda"],
  "Rolls-Royce": ["Cullinan","Dawn","Ghost","Phantom","Spectre","Wraith"]
};

/* Trims worth asking about. Only for cars where the answer changes the work — exposed
 * carbon, Alcantara, ceramic brakes and factory PPF all need different products and
 * different time. Anything not listed falls back to a free-text box. */
window.TRIMS = {
  "Aston Martin": ["Base","S","AMR","F1 Edition","Volante (convertible)"],
  "Bentley": ["Base","V8","Speed","Azure","Mulliner","S"],
  "Bugatti": ["Base","Sport","Super Sport","Pur Sport"],
  "Ferrari": ["Base","S / Spider","Pista","Assetto Fiorano","Competizione"],
  "Ford (Performance)": ["Base","Heritage Edition","Carbon Series","Track Pack"],
  "Koenigsegg": ["Base","Absolut","Attack"],
  "Lamborghini": ["Base","S","EVO","Performante","STO","SV / SVJ","Spyder / Roadster"],
  "Lotus": ["Base","First Edition","Sport","Cup","R"],
  "McLaren": ["Base","Spider","LT","MSO"],
  "Pagani": ["Base","Roadster","BC","R"],
  "Rolls-Royce": ["Base","Extended Wheelbase","Black Badge","Landspeed"],
  "Porsche": ["Base","S","4S","GTS","Turbo","Turbo S","GT3","GT3 RS","GT4","Targa","Cabriolet"],
  "Mercedes-Benz": ["Base","AMG Line","AMG 43","AMG 53","AMG 63","AMG Black Series","Maybach"],
  "BMW": ["Base","M Sport","M Performance (M40i / M50i)","Full M","M Competition","CS / CSL"],
  "Audi": ["Base","S line","S","RS","RS Performance"],
  "Chevrolet": ["Base","RS","Z51","Z06","ZR1","ZL1","1LE","Trail Boss","High Country"],
  "Dodge": ["Base","R/T","Scat Pack","SRT","Hellcat","Demon","Redeye"],
  "Tesla": ["Standard","Long Range","Performance","Plaid","Cyberbeast"],
  "Jeep": ["Base","Rubicon","Trailhawk","Summit","392","Trackhawk"],
  "Toyota": ["Base","TRD Sport","TRD Off-Road","TRD Pro","Nightshade"],
  "Land Rover": ["Base","Dynamic","Autobiography","SVR / SV","First Edition"]
};

/* Fold the exotics into the main make list, alphabetically, with "Other" kept last. */
(function mergeExotics(){
  var v = window.VEHICLES, x = window.EXOTICS, merged = {};
  var keys = Object.keys(v).filter(function(k){ return k !== 'Other' })
               .concat(Object.keys(x)).sort(function(a,b){ return a.localeCompare(b) });
  keys.forEach(function(k){ merged[k] = v[k] || x[k] });
  merged['Other'] = [];
  window.VEHICLES = merged;
  window.EXOTIC_MAKES = Object.keys(x);
})();

/* ---------------------------------------------------------------------------
 * Production years. [start, end] — end null means still sold.
 * A model can have more than one window (the Integra, the Bronco, the Demon),
 * so every value is an ARRAY of windows.
 *
 * Anything not listed here shows the full year range, so a missing entry is
 * harmless. Where a date was uncertain I widened the window rather than
 * narrowed it: offering a year that did not exist is a shrug, blocking the
 * year someone actually owns is a lost booking.
 * ------------------------------------------------------------------------- */
window.MODEL_YEARS = {
 "Acura":{"ILX":[[2013,2022]],"Integra":[[1995,2001],[2023,null]],"MDX":[[2001,null]],
   "RDX":[[2007,null]],"RLX":[[2014,2020]],"TL":[[1995,2014]],"TLX":[[2015,null]],
   "TSX":[[2004,2014]],"ZDX":[[2010,2013],[2024,null]]},
 "Alfa Romeo":{"Giulia":[[2017,null]],"Stelvio":[[2018,null]],"Tonale":[[2023,null]]},
 "Audi":{"A3":[[2006,null]],"A5":[[2008,null]],"A7":[[2012,null]],"e-tron":[[2019,null]],
   "Q3":[[2015,null]],"Q5":[[2009,null]],"Q7":[[2007,null]],"Q8":[[2019,null]],
   "S5":[[2008,null]],"TT":[[2000,2023]]},
 "BMW":{"2 Series":[[2014,null]],"4 Series":[[2014,null]],"8 Series":[[2019,null]],
   "i4":[[2022,null]],"iX":[[2022,null]],"M3":[[1995,null]],"M4":[[2015,null]],
   "X1":[[2013,null]],"X2":[[2018,null]],"X3":[[2004,null]],"X4":[[2015,null]],
   "X5":[[2000,null]],"X6":[[2008,null]],"X7":[[2019,null]],"Z4":[[1996,null]]},
 "Buick":{"Enclave":[[2008,null]],"Encore":[[2013,2022]],"Encore GX":[[2020,null]],
   "Envision":[[2016,null]],"Envista":[[2024,null]],"LaCrosse":[[2005,2019]],"Regal":[[1995,2020]]},
 "Cadillac":{"ATS":[[2013,2019]],"CT4":[[2020,null]],"CT5":[[2020,null]],"CTS":[[2003,2019]],
   "Escalade":[[1999,null]],"LYRIQ":[[2023,null]],"SRX":[[2004,2016]],"XT4":[[2019,null]],
   "XT5":[[2017,null]],"XT6":[[2020,null]],"XTS":[[2013,2019]]},
 "Chevrolet":{"Blazer":[[1995,2005],[2019,null]],"Bolt":[[2017,2023]],
   "Camaro":[[1995,2002],[2010,2024]],"Colorado":[[2004,null]],"Cruze":[[2011,2019]],
   "Equinox":[[2005,null]],"Impala":[[1995,2020]],"Malibu":[[1997,2025]],
   "Silverado 1500":[[1999,null]],"Silverado 2500":[[1999,null]],"Sonic":[[2012,2020]],
   "Spark":[[2013,2022]],"Trailblazer":[[2002,2009],[2021,null]],"Traverse":[[2009,null]],
   "Trax":[[2015,null]]},
 "Chrysler":{"300":[[2005,2023]],"Pacifica":[[2004,2008],[2017,null]],
   "Voyager":[[1995,2003],[2020,null]]},
 "Dodge":{"Challenger":[[2008,2023]],"Charger":[[2006,null]],"Durango":[[1998,null]],
   "Grand Caravan":[[1995,2020]],"Hornet":[[2023,null]],"Journey":[[2009,2020]]},
 "Fiat":{"500":[[2012,2019]],"500X":[[2016,2023]]},
 "Ford":{"Bronco":[[1995,1996],[2021,null]],"Bronco Sport":[[2021,null]],
   "EcoSport":[[2018,2022]],"Edge":[[2007,2024]],"Escape":[[2001,null]],
   "Expedition":[[1997,null]],"F-250":[[1999,null]],"Fiesta":[[2011,2019]],
   "Focus":[[2000,2018]],"Fusion":[[2006,2020]],"Maverick":[[2022,null]],
   "Mustang Mach-E":[[2021,null]],"Ranger":[[1995,2011],[2019,null]],
   "Transit":[[2015,null]],"Transit Connect":[[2010,2023]]},
 "Genesis":{"G70":[[2019,null]],"G80":[[2017,null]],"G90":[[2017,null]],
   "GV70":[[2022,null]],"GV80":[[2021,null]]},
 "GMC":{"Acadia":[[2007,null]],"Canyon":[[2004,null]],"Hummer EV":[[2022,null]],
   "Sierra 1500":[[1999,null]],"Sierra 2500":[[1999,null]],"Terrain":[[2010,null]]},
 "Honda":{"CR-Z":[[2011,2016]],"Element":[[2003,2011]],"Fit":[[2007,2020]],
   "HR-V":[[2016,null]],"Insight":[[2000,2006],[2010,2014],[2019,2022]],
   "Passport":[[1995,2002],[2019,null]],"Pilot":[[2003,null]],"Prologue":[[2024,null]],
   "Ridgeline":[[2006,2014],[2017,null]]},
 "Hyundai":{"Accent":[[1995,2022]],"Ioniq 5":[[2022,null]],"Ioniq 6":[[2023,null]],
   "Kona":[[2018,null]],"Palisade":[[2020,null]],"Santa Cruz":[[2022,null]],
   "Santa Fe":[[2001,null]],"Tucson":[[2005,null]],"Veloster":[[2012,2022]],
   "Venue":[[2020,null]]},
 "Infiniti":{"Q50":[[2014,null]],"Q60":[[2014,2022]],"QX50":[[2014,null]],
   "QX55":[[2022,null]],"QX60":[[2014,null]],"QX80":[[2014,null]]},
 "Jaguar":{"E-Pace":[[2018,null]],"F-Pace":[[2017,null]],"F-Type":[[2014,2024]],
   "I-Pace":[[2019,null]],"XE":[[2017,2020]],"XF":[[2009,null]]},
 "Jeep":{"Cherokee":[[1995,2001],[2014,2023]],"Compass":[[2007,null]],
   "Gladiator":[[2020,null]],"Grand Wagoneer":[[2022,null]],"Patriot":[[2007,2017]],
   "Renegade":[[2015,2023]],"Wagoneer":[[2022,null]]},
 "Kia":{"Carnival":[[2002,2014],[2022,null]],"EV6":[[2022,null]],"EV9":[[2024,null]],
   "Forte":[[2010,null]],"K5":[[2021,null]],"Niro":[[2017,null]],"Optima":[[2001,2020]],
   "Rio":[[2001,2023]],"Sedona":[[2002,2021]],"Seltos":[[2021,null]],
   "Sorento":[[2003,null]],"Soul":[[2010,null]],"Stinger":[[2018,2023]],
   "Telluride":[[2020,null]]},
 "Land Rover":{"Defender":[[1995,1997],[2020,null]],"Discovery Sport":[[2015,null]],
   "Range Rover Evoque":[[2012,null]],"Range Rover Sport":[[2006,null]],
   "Range Rover Velar":[[2018,null]]},
 "Lexus":{"GS":[[1995,2020]],"GX":[[2003,null]],"LX":[[1996,null]],"NX":[[2015,null]],
   "RC":[[2015,null]],"RX":[[1999,null]],"TX":[[2024,null]],"UX":[[2019,null]],
   "IS":[[2001,null]]},
 "Lincoln":{"Aviator":[[2003,2005],[2020,null]],"Corsair":[[2020,null]],
   "Nautilus":[[2019,null]],"Navigator":[[1998,null]],"MKC":[[2015,2019]],"MKZ":[[2007,2020]]},
 "Maserati":{"Ghibli":[[2014,2024]],"Grecale":[[2023,null]],"Levante":[[2017,null]]},
 "Mazda":{"CX-30":[[2020,null]],"CX-5":[[2013,null]],"CX-50":[[2023,null]],
   "CX-9":[[2007,2023]],"CX-90":[[2024,null]],"Mazda3":[[2004,null]],"Mazda6":[[2003,2021]]},
 "Mercedes-Benz":{"A-Class":[[2019,2022]],"CLA":[[2014,null]],"EQB":[[2022,null]],
   "EQE":[[2023,null]],"EQS":[[2022,null]],"G-Class":[[2002,null]],"GLA":[[2015,null]],
   "GLB":[[2020,null]],"GLC":[[2016,null]],"GLE":[[2016,null]],"GLS":[[2017,null]],
   "Sprinter":[[2003,null]]},
 "MINI":{"Clubman":[[2008,2024]],"Countryman":[[2011,null]],"Hardtop":[[2002,null]]},
 "Mitsubishi":{"Eclipse Cross":[[2018,null]],"Mirage":[[2014,null]],
   "Outlander":[[2003,null]],"Outlander Sport":[[2011,null]]},
 "Nissan":{"Ariya":[[2023,null]],"Armada":[[2004,null]],"Frontier":[[1998,null]],
   "Kicks":[[2018,null]],"Leaf":[[2011,null]],"Maxima":[[1995,2023]],"Murano":[[2003,null]],
   "Rogue":[[2008,null]],"Titan":[[2004,2024]],"Versa":[[2007,null]],"Z":[[2023,null]]},
 "Polestar":{"Polestar 2":[[2021,null]],"Polestar 3":[[2024,null]]},
 "Porsche":{"718 Boxster":[[2017,null]],"718 Cayman":[[2017,null]],"Cayenne":[[2003,null]],
   "Macan":[[2015,null]],"Panamera":[[2010,null]],"Taycan":[[2020,null]]},
 "Ram":{"1500":[[2011,null]],"2500":[[2011,null]],"3500":[[2011,null]],"ProMaster":[[2014,null]]},
 "Rivian":{"R1S":[[2022,null]],"R1T":[[2022,null]]},
 "Subaru":{"Ascent":[[2019,null]],"BRZ":[[2013,null]],"Crosstrek":[[2013,null]],
   "Forester":[[1998,null]],"Solterra":[[2023,null]],"WRX":[[2002,null]]},
 "Tesla":{"Cybertruck":[[2024,null]],"Model 3":[[2017,null]],"Model S":[[2012,null]],
   "Model X":[[2016,null]],"Model Y":[[2020,null]]},
 "Toyota":{"Avalon":[[1995,2022]],"bZ4X":[[2023,null]],"Corolla Cross":[[2022,null]],
   "Crown":[[2023,null]],"Grand Highlander":[[2024,null]],"Highlander":[[2001,null]],
   "Prius":[[2001,null]],"RAV4":[[1996,null]],"Sequoia":[[2001,null]],"Sienna":[[1998,null]],
   "Tundra":[[2000,null]],"Venza":[[2009,2015],[2021,2024]]},
 "Volkswagen":{"Atlas":[[2018,null]],"Atlas Cross Sport":[[2020,null]],"ID.4":[[2021,null]],
   "Passat":[[1995,2022]],"Taos":[[2022,null]],"Tiguan":[[2009,null]]},
 "Volvo":{"C40":[[2022,null]],"S60":[[2001,null]],"S90":[[2017,null]],"V60":[[2015,null]],
   "V90":[[2017,null]],"XC40":[[2019,null]],"XC60":[[2010,null]],"XC90":[[2003,null]]},

 "Aston Martin":{"DB11":[[2017,2023]],"DB12":[[2024,null]],"DBS":[[2008,2012],[2019,2023]],
   "DBX":[[2021,null]],"Vantage":[[2006,null]],"Vanquish":[[2002,2018],[2025,null]]},
 "Bentley":{"Bentayga":[[2017,null]],"Continental GT":[[2004,null]],
   "Flying Spur":[[2006,null]],"Mulsanne":[[2011,2020]]},
 "Bugatti":{"Chiron":[[2017,2024]],"Mistral":[[2024,null]],"Tourbillon":[[2026,null]],
   "Veyron":[[2006,2015]]},
 "Ferrari":{"296 GTB":[[2022,null]],"488":[[2016,2020]],"812 Superfast":[[2018,2023]],
   "F8 Tributo":[[2020,2023]],"Portofino":[[2019,2023]],"Purosangue":[[2024,null]],
   "Roma":[[2021,null]],"SF90":[[2020,null]]},
 "Ford (Performance)":{"GT":[[2005,2006],[2017,2022]],
   "Mustang Shelby GT350":[[2016,2020]],"Mustang Shelby GT500":[[2007,2014],[2020,2022]]},
 "Koenigsegg":{"Gemera":[[2025,null]],"Jesko":[[2023,null]],"Regera":[[2016,2022]]},
 "Lamborghini":{"Aventador":[[2012,2022]],"Gallardo":[[2004,2013]],"Huracan":[[2015,2024]],
   "Revuelto":[[2024,null]],"Temerario":[[2026,null]],"Urus":[[2019,null]]},
 "Lotus":{"Elise":[[1996,2021]],"Emira":[[2023,null]],"Eletre":[[2024,null]],
   "Evora":[[2010,2021]],"Exige":[[2000,2021]]},
 "McLaren":{"570S":[[2016,2021]],"720S":[[2018,2023]],"750S":[[2024,null]],
   "Artura":[[2023,null]],"GT":[[2020,2023]],"P1":[[2014,2015]],"Senna":[[2019,2020]]},
 "Pagani":{"Huayra":[[2013,2023]],"Utopia":[[2024,null]],"Zonda":[[1999,2019]]},
 "Rolls-Royce":{"Cullinan":[[2019,null]],"Dawn":[[2016,2023]],"Ghost":[[2010,null]],
   "Phantom":[[2004,null]],"Spectre":[[2024,null]],"Wraith":[[2014,2023]]}
};

/* Trim windows, keyed by make then trim. Intersected with the model window above.
 * Only the unambiguous ones — if a trim is not listed it simply does not narrow
 * anything, and if an intersection ever comes out empty the model window wins. */
window.TRIM_YEARS = {
 "Aston Martin":{"AMR":[[2019,null]],"F1 Edition":[[2021,null]]},
 "Audi":{"RS Performance":[[2023,null]]},
 "Bentley":{"Speed":[[2008,null]],"Mulliner":[[2020,null]],"Azure":[[2022,null]]},
 "BMW":{"M Competition":[[2016,null]],"CS / CSL":[[2022,null]],
   "M Performance (M40i / M50i)":[[2016,null]]},
 "Chevrolet":{"Z06":[[2001,null]],"ZR1":[[2009,2019],[2025,null]],"1LE":[[2013,null]],
   "Trail Boss":[[2019,null]],"High Country":[[2014,null]]},
 "Dodge":{"Hellcat":[[2015,2024]],"Demon":[[2018,2018],[2023,2023]],
   "Redeye":[[2019,2023]],"Scat Pack":[[2015,null]]},
 "Ferrari":{"Pista":[[2019,2020]],"Assetto Fiorano":[[2021,null]],"Competizione":[[2022,null]]},
 "Ford (Performance)":{"Heritage Edition":[[2020,null]],"Carbon Series":[[2019,null]]},
 "Jeep":{"Trackhawk":[[2018,2021]],"392":[[2021,null]]},
 "Lamborghini":{"STO":[[2021,2024]],"Performante":[[2018,null]],"EVO":[[2019,2024]],
   "SV / SVJ":[[2015,2022]]},
 "Land Rover":{"SVR / SV":[[2015,null]],"Autobiography":[[2010,null]]},
 "McLaren":{"LT":[[2016,null]],"MSO":[[2012,null]],"Spider":[[2013,null]]},
 "Mercedes-Benz":{"AMG 43":[[2013,null]],"AMG 53":[[2019,null]],
   "AMG Black Series":[[2006,null]],"Maybach":[[2015,null]]},
 "Porsche":{"GT3":[[1999,null]],"GT3 RS":[[2004,null]],"GT4":[[2016,null]]},
 "Rolls-Royce":{"Black Badge":[[2016,null]]},
 "Tesla":{"Plaid":[[2021,null]],"Cyberbeast":[[2024,null]],"Long Range":[[2017,null]]},
 "Toyota":{"TRD Pro":[[2015,null]],"Nightshade":[[2019,null]]}
};

/* Towns we actually cover. Same list as the Service Area section — keep them in step.
 * A dropdown instead of a free-text box means nobody books from Stamford by accident. */
window.TOWNS = {
  "New Haven County": ["New Haven","Hamden","Milford","West Haven","East Haven","North Haven","Branford","Guilford","Orange","Woodbridge","Cheshire","Wallingford","Meriden"],
  "Naugatuck Valley": ["Shelton","Ansonia","Derby","Seymour","Oxford","Beacon Falls","Naugatuck","Waterbury"],
  "Central & Hartford County": ["Hartford","West Hartford","New Britain","Berlin","Southington","Plainville","Newington","Wethersfield","Rocky Hill","Cromwell","Middletown","Farmington","Glastonbury"]
};
