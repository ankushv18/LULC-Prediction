// Land cover parameter
var values = [1, 2, 3, 4, 5, 6,];
var palette = [
  '013220', 'FFC0CB', 'FFFF00', '0000FF', 'FF0000', '008000'
];
var names = [
  'Waterbody', 'Dense forest', 'Agriculture land', 'Range land', 'Builtup', 'Barren land'
];

// Show legend
legend(palette, values, names);

// Land cover dictionary for visualization
var lulcDict = {
  'LULC_class_palette': palette,
  'LULC_class_values': values,
  'LULC_class_names': names
};

// Land cover data for 2014 and 2024
var lulc2014 = ee.Image('projects/ee-kumarmauryaankush65/assets/2014');
var lulc2024 = ee.Image('projects/ee-kumarmauryaankush65/assets/2024');

// Region of interest
var roi = lulc2014.geometry();

// Put the land cover in a list
var lulcList = [
  { year: 2014, image: lulc2014 },
  { year: 2024, image: lulc2024 }
];

// Show the 2019 and 2022 land cover
lulcList.map(function(dict){
  Map.addLayer(dict.image.set(lulcDict), {}, 'LULC ' + dict.year);
});

// Create land cover change map
var changeValues = [];
var changeNames = [];
var changeMap = ee.Image(0);
values.map(function(value1, index1){
  values.map(function(value2, index2){
    var changeValue = value1 * 1e2 + value2;
    changeValues.push(changeValue);
    
    var changeName = names[index1] + ' -> ' + names[index2];
    changeNames.push(changeName);
    
    changeMap = changeMap.where(lulcList[0].image.eq(value1).and(lulcList[1].image.eq(value2)), changeValue);
  });
});

// Show the change map
changeMap = changeMap.selfMask();
Map.addLayer(changeMap, { min: 101, max: 1010, palette: palette }, 'Land cover change map');

// Print the change dictionary
var changeDict = ee.Dictionary.fromLists(changeValues.map(function(value){ return String(value) }), changeNames);
print('Land cover change values', changeDict);

// Create images with variables to predict land cover change
var variables = ee.Image([
  lulc2014.rename('start'),
  lulc2024.rename('end'),
  changeMap.rename('transition'),
  srtm.clip(roi).rename('elevation'),
  ee.Image(2024).multiply(lulc2014.neq(lulc2024)).rename('year')
]);

// Property names for prediction
var propNames = ['start', 'transition', 'elevation', 'year'];

// Propert names to predict
var predictName = 'end';

// Sample image
var sample = variables.stratifiedSample({
  numPoints: 3000,
  classBand: 'transition', 
  scale: 10,
  region: roi
}).randomColumn();

// Split train and test
var train = sample.filter(ee.Filter.lte('random', 0.8));
var test = sample.filter(ee.Filter.gt('random', 0.8));
print(
  ee.String('Sample train: ').cat(ee.String(train.size())),
  ee.String('Sample test: ').cat(ee.String(test.size()))
);

// Build random forest model for prediction
var model = ee.Classifier.smileRandomForest(50).train(train, predictName, propNames);

// Test model accuracy
var cm = test.classify(model, 'prediction').errorMatrix('end', 'prediction');
print(
  'Confusion matrix', cm,
  ee.String('Accuracy: ').cat(ee.String(cm.accuracy())),
  ee.String('Kappa: ').cat(ee.String(cm.kappa()))
);

// Variables for predict for year 2033
var variables2025 = ee.Image([
  lulc2024.rename('start'),
  changeMap.rename('transition'),
  srtm.clip(roi).rename('elevation'),
  ee.Image(2033).multiply(lulc2024.neq(lulc2014)).rename('year')
]);

// Apply the model for the variables for 2033
var lulc2033 = variables2025.classify(model, 'LULC').set(lulcDict);
Map.addLayer(lulc2033, {}, 'LULC 2033 Prediction');

// Add lulc 2033 to LULC list
lulcList.push({ year: 2033, image: lulc2033 });

// Calculate land cover area per year
var lulcAreafeatures= ee.FeatureCollection(lulcList.map(function(dict){
  var imageArea = ee.Image.pixelArea().divide(10000);
  var reduceArea = imageArea.addBands(dict.image).reduceRegion({
    reducer: ee.Reducer.sum().setOutputs(['area']).group(1, 'class'),
    scale: 10,
    geometry: roi,
    bestEffort: true
  }).get('groups');
  
  var features = ee.FeatureCollection(ee.List(reduceArea).map(function(dictionary){
    dictionary = ee.Dictionary(dictionary);
    var label = ee.List(names).get(ee.Number(dictionary.get('class')).subtract(1));
    dictionary = dictionary.set('year', ee.Number(dict.year).toInt());
    dictionary = dictionary.set('LULC', label);
    return ee.Feature(null, dictionary);
  }));
  
  return features;
})).flatten();

// Make chart for land cover area change
var chartArea = ui.Chart.feature.groups(lulcAreafeatures, 'year', 'area', 'LULC')
  .setOptions({
    title: 'LULC area changes 2014 - 2024 - 2033'
  });
print(chartArea);

// Function to add legend
function legend(palette, values, names){
  Map.add(
    ui.Panel(
      palette.map(function(color, index){
        return ui.Panel([
          ui.Label('', { backgroundColor: color, width: '30px', height: '20px' }),
          ui.Label(values[index], { height: '20px' }),
          ui.Label(names[index], { height: '20px' })
        ], ui.Panel.Layout.flow('horizontal'));
      }),
      ui.Panel.Layout.flow('vertical'),
      { position: 'bottom-left' }
    )
  );
}