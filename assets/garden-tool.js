        // Tab Navigation
        document.querySelectorAll('.tab-ibtn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.tab-ibtn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.calc-panel').forEach(p => p.classList.remove('active'));
                this.classList.add('active');
                document.getElementById(this.dataset.tab).classList.add('active');
            });
        });
        
        // Unit Toggle
        document.querySelectorAll('.unit-ibtn').forEach(btn => {
            btn.addEventListener('click', function() {
                const calc = this.dataset.calc;
                const unit = this.dataset.unit;
                const container = this.closest('.calc-panel');
                
                container.querySelectorAll('.unit-ibtn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                const labels = container.querySelectorAll('.unit-label');
                if (unit === 'imperial') {
                    labels[0].textContent = '(feet)';
                    labels[1].textContent = '(feet)';
                    labels[2].textContent = '(inches)';
                } else {
                    labels[0].textContent = '(meters)';
                    labels[1].textContent = '(meters)';
                    labels[2].textContent = '(centimeters)';
                }
            });
        });
        
        // Grid Type Toggle
        document.querySelectorAll('.grid-type-ibtn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.grid-type-ibtn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                const rowSpacingGroup = document.getElementById('row-spacing-group');
                if (this.dataset.grid === 'rectangular') {
                    rowSpacingGroup.style.display = 'block';
                } else {
                    rowSpacingGroup.style.display = 'none';
                }
            });
        });
        
        // SOIL CALCULATOR
        function calculateSoil() {
            const length = parseFloat(document.getElementById('soil-length').value);
            const width = parseFloat(document.getElementById('soil-width').value);
            const depth = parseFloat(document.getElementById('soil-depth').value);
            const shape = document.getElementById('soil-shape').value;
            const unit = document.querySelector('#soil .unit-ibtn.active').dataset.unit;
            
            if (!length || !width || !depth) {
                alert('Please fill in all fields');
                return;
            }
            
            let area, volume, cubicYards, cubicFeet, bags;
            
            if (unit === 'imperial') {
                if (shape === 'rectangular') {
                    area = length * width;
                } else {
                    area = Math.PI * Math.pow(length / 2, 2);
                }
                volume = area * (depth / 12);
                cubicYards = volume / 27;
                cubicFeet = volume;
                bags = Math.ceil(cubicFeet / 2);
            } else {
                const depthM = depth / 100;
                if (shape === 'rectangular') {
                    area = length * width;
                } else {
                    area = Math.PI * Math.pow(length / 2, 2);
                }
                volume = area * depthM;
                cubicYards = volume * 1.30795;
                cubicFeet = volume * 35.3147;
                bags = Math.ceil(cubicFeet / 2);
            }
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Total Volume:</span>
                    <span class="result-value">${cubicYards.toFixed(2)} cubic yards</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Cubic Feet:</span>
                    <span class="result-value">${cubicFeet.toFixed(2)} cu ft</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Bags Needed (2 cu ft):</span>
                    <span class="result-value">${bags} bags</span>
                </div>
                <div class="result-item">
                    <span class="result-label">With 10% Extra:</span>
                    <span class="result-value">${Math.ceil(bags * 1.1)} bags</span>
                </div>
            `;
            
            document.getElementById('soil-output').innerHTML = output;
            document.getElementById('soil-result').classList.add('show');
        }
        
        // MULCH CALCULATOR
        function calculateMulch() {
            const length = parseFloat(document.getElementById('mulch-length').value);
            const width = parseFloat(document.getElementById('mulch-width').value);
            const depth = parseFloat(document.getElementById('mulch-depth').value);
            const bagSize = parseFloat(document.getElementById('bag-size').value);
            const unit = document.querySelector('#mulch .unit-ibtn.active').dataset.unit;
            
            if (!length || !width || !depth) {
                alert('Please fill in all fields');
                return;
            }
            
            let area, cubicYards, cubicFeet, bags;
            
            if (unit === 'imperial') {
                area = length * width;
                cubicYards = (area * depth) / 324;
                cubicFeet = cubicYards * 27;
                bags = Math.ceil(cubicFeet / bagSize);
            } else {
                const depthM = depth / 100;
                const volume = length * width * depthM;
                cubicYards = volume * 1.30795;
                cubicFeet = volume * 35.3147;
                bags = Math.ceil(cubicFeet / bagSize);
            }
            
            const coverage = (area).toFixed(1);
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Coverage Area:</span>
                    <span class="result-value">${coverage} sq ${unit === 'imperial' ? 'ft' : 'm'}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Volume Needed:</span>
                    <span class="result-value">${cubicYards.toFixed(2)} cubic yards</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Bags Needed:</span>
                    <span class="result-value">${bags} bags (${bagSize} cu ft)</span>
                </div>
                <div class="result-item">
                    <span class="result-label">With 10% Extra:</span>
                    <span class="result-value">${Math.ceil(bags * 1.1)} bags</span>
                </div>
            `;
            
            document.getElementById('mulch-output').innerHTML = output;
            document.getElementById('mulch-result').classList.add('show');
        }
        
        // PLANT SPACING CALCULATOR
        function calculateSpacing() {
            const length = parseFloat(document.getElementById('spacing-length').value);
            const width = parseFloat(document.getElementById('spacing-width').value);
            const plantSpacing = parseFloat(document.getElementById('plant-spacing').value) / 12;
            const gridType = document.querySelector('.grid-type-ibtn.active').dataset.grid;
            
            if (!length || !width || !plantSpacing) {
                alert('Please fill in all fields');
                return;
            }
            
            let totalPlants, rows, plantsPerRow;
            const area = length * width;
            
            if (gridType === 'square') {
                plantsPerRow = Math.floor(length / plantSpacing) + 1;
                rows = Math.floor(width / plantSpacing) + 1;
                totalPlants = plantsPerRow * rows;
            } else if (gridType === 'rectangular') {
                const rowSpacing = parseFloat(document.getElementById('row-spacing').value) / 12;
                plantsPerRow = Math.floor(length / plantSpacing) + 1;
                rows = Math.floor(width / rowSpacing) + 1;
                totalPlants = plantsPerRow * rows;
            } else {
                const rowSpacing = plantSpacing * 0.866;
                plantsPerRow = Math.floor(length / plantSpacing) + 1;
                rows = Math.floor(width / rowSpacing) + 1;
                const oddRows = Math.ceil(rows / 2);
                const evenRows = Math.floor(rows / 2);
                totalPlants = (plantsPerRow * oddRows) + ((plantsPerRow - 1) * evenRows);
                totalPlants = Math.ceil(totalPlants * 1.15);
            }
            
            const plantDensity = (totalPlants / area).toFixed(2);
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Total Plants Needed:</span>
                    <span class="result-value">${totalPlants} plants</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Plant Density:</span>
                    <span class="result-value">${plantDensity} per sq ft</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Grid Pattern:</span>
                    <span class="result-value">${gridType.charAt(0).toUpperCase() + gridType.slice(1)}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Garden Area:</span>
                    <span class="result-value">${area.toFixed(1)} sq ft</span>
                </div>
            `;
            
            document.getElementById('spacing-output').innerHTML = output;
            document.getElementById('spacing-result').classList.add('show');
        }
        
        // WATERING CALCULATOR
        function calculateWatering() {
            const length = parseFloat(document.getElementById('water-length').value);
            const width = parseFloat(document.getElementById('water-width').value);
            const plantType = parseFloat(document.getElementById('plant-type').value);
            const soilType = parseFloat(document.getElementById('soil-type').value);
            const climateType = parseFloat(document.getElementById('climate-type').value);
            
            if (!length || !width) {
                alert('Please fill in all fields');
                return;
            }
            
            const area = length * width;
            const baseWater = area * plantType;
            const adjustedWater = baseWater * soilType * climateType;
            const perSession = adjustedWater / 2;
            const perSession3 = adjustedWater / 3;
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Weekly Water Needed:</span>
                    <span class="result-value">${adjustedWater.toFixed(1)} gallons</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Per Session (2x/week):</span>
                    <span class="result-value">${perSession.toFixed(1)} gallons</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Per Session (3x/week):</span>
                    <span class="result-value">${perSession3.toFixed(1)} gallons</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Garden Area:</span>
                    <span class="result-value">${area.toFixed(1)} sq ft</span>
        
  
    <script>
        // Tab Navigation
        document.querySelectorAll('.tab-ibtn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.tab-ibtn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.calc-panel').forEach(p => p.classList.remove('active'));
                this.classList.add('active');
                document.getElementById(this.dataset.tab).classList.add('active');
            });
        });
        
        // Unit Toggle
        document.querySelectorAll('.unit-ibtn').forEach(btn => {
            btn.addEventListener('click', function() {
                const calc = this.dataset.calc;
                const unit = this.dataset.unit;
                const container = this.closest('.calc-panel');
                
                container.querySelectorAll('.unit-ibtn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                const labels = container.querySelectorAll('.unit-label');
                if (unit === 'imperial') {
                    labels[0].textContent = '(feet)';
                    labels[1].textContent = '(feet)';
                    labels[2].textContent = '(inches)';
                } else {
                    labels[0].textContent = '(meters)';
                    labels[1].textContent = '(meters)';
                    labels[2].textContent = '(centimeters)';
                }
            });
        });
        
        // Grid Type Toggle
        document.querySelectorAll('.grid-type-ibtn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.grid-type-ibtn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                const rowSpacingGroup = document.getElementById('row-spacing-group');
                if (this.dataset.grid === 'rectangular') {
                    rowSpacingGroup.style.display = 'block';
                } else {
                    rowSpacingGroup.style.display = 'none';
                }
            });
        });
        
        // SOIL CALCULATOR
        function calculateSoil() {
            const length = parseFloat(document.getElementById('soil-length').value);
            const width = parseFloat(document.getElementById('soil-width').value);
            const depth = parseFloat(document.getElementById('soil-depth').value);
            const shape = document.getElementById('soil-shape').value;
            const unit = document.querySelector('#soil .unit-ibtn.active').dataset.unit;
            
            if (!length || !width || !depth) {
                alert('Please fill in all fields');
                return;
            }
            
            let area, volume, cubicYards, cubicFeet, bags;
            
            if (unit === 'imperial') {
                if (shape === 'rectangular') {
                    area = length * width;
                } else {
                    area = Math.PI * Math.pow(length / 2, 2);
                }
                volume = area * (depth / 12);
                cubicYards = volume / 27;
                cubicFeet = volume;
                bags = Math.ceil(cubicFeet / 2);
            } else {
                const depthM = depth / 100;
                if (shape === 'rectangular') {
                    area = length * width;
                } else {
                    area = Math.PI * Math.pow(length / 2, 2);
                }
                volume = area * depthM;
                cubicYards = volume * 1.30795;
                cubicFeet = volume * 35.3147;
                bags = Math.ceil(cubicFeet / 2);
            }
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Total Volume:</span>
                    <span class="result-value">${cubicYards.toFixed(2)} cubic yards</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Cubic Feet:</span>
                    <span class="result-value">${cubicFeet.toFixed(2)} cu ft</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Bags Needed (2 cu ft):</span>
                    <span class="result-value">${bags} bags</span>
                </div>
                <div class="result-item">
                    <span class="result-label">With 10% Extra:</span>
                    <span class="result-value">${Math.ceil(bags * 1.1)} bags</span>
                </div>
            `;
            
            document.getElementById('soil-output').innerHTML = output;
            document.getElementById('soil-result').classList.add('show');
        }
        
        // MULCH CALCULATOR
        function calculateMulch() {
            const length = parseFloat(document.getElementById('mulch-length').value);
            const width = parseFloat(document.getElementById('mulch-width').value);
            const depth = parseFloat(document.getElementById('mulch-depth').value);
            const bagSize = parseFloat(document.getElementById('bag-size').value);
            const unit = document.querySelector('#mulch .unit-ibtn.active').dataset.unit;
            
            if (!length || !width || !depth) {
                alert('Please fill in all fields');
                return;
            }
            
            let area, cubicYards, cubicFeet, bags;
            
            if (unit === 'imperial') {
                area = length * width;
                cubicYards = (area * depth) / 324;
                cubicFeet = cubicYards * 27;
                bags = Math.ceil(cubicFeet / bagSize);
            } else {
                const depthM = depth / 100;
                const volume = length * width * depthM;
                cubicYards = volume * 1.30795;
                cubicFeet = volume * 35.3147;
                bags = Math.ceil(cubicFeet / bagSize);
            }
            
            const coverage = (area).toFixed(1);
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Coverage Area:</span>
                    <span class="result-value">${coverage} sq ${unit === 'imperial' ? 'ft' : 'm'}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Volume Needed:</span>
                    <span class="result-value">${cubicYards.toFixed(2)} cubic yards</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Bags Needed:</span>
                    <span class="result-value">${bags} bags (${bagSize} cu ft)</span>
                </div>
                <div class="result-item">
                    <span class="result-label">With 10% Extra:</span>
                    <span class="result-value">${Math.ceil(bags * 1.1)} bags</span>
                </div>
            `;
            
            document.getElementById('mulch-output').innerHTML = output;
            document.getElementById('mulch-result').classList.add('show');
        }
        
        // PLANT SPACING CALCULATOR
        function calculateSpacing() {
            const length = parseFloat(document.getElementById('spacing-length').value);
            const width = parseFloat(document.getElementById('spacing-width').value);
            const plantSpacing = parseFloat(document.getElementById('plant-spacing').value) / 12;
            const gridType = document.querySelector('.grid-type-ibtn.active').dataset.grid;
            
            if (!length || !width || !plantSpacing) {
                alert('Please fill in all fields');
                return;
            }
            
            let totalPlants, rows, plantsPerRow;
            const area = length * width;
            
            if (gridType === 'square') {
                plantsPerRow = Math.floor(length / plantSpacing) + 1;
                rows = Math.floor(width / plantSpacing) + 1;
                totalPlants = plantsPerRow * rows;
            } else if (gridType === 'rectangular') {
                const rowSpacing = parseFloat(document.getElementById('row-spacing').value) / 12;
                plantsPerRow = Math.floor(length / plantSpacing) + 1;
                rows = Math.floor(width / rowSpacing) + 1;
                totalPlants = plantsPerRow * rows;
            } else {
                const rowSpacing = plantSpacing * 0.866;
                plantsPerRow = Math.floor(length / plantSpacing) + 1;
                rows = Math.floor(width / rowSpacing) + 1;
                const oddRows = Math.ceil(rows / 2);
                const evenRows = Math.floor(rows / 2);
                totalPlants = (plantsPerRow * oddRows) + ((plantsPerRow - 1) * evenRows);
                totalPlants = Math.ceil(totalPlants * 1.15);
            }
            
            const plantDensity = (totalPlants / area).toFixed(2);
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Total Plants Needed:</span>
                    <span class="result-value">${totalPlants} plants</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Plant Density:</span>
                    <span class="result-value">${plantDensity} per sq ft</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Grid Pattern:</span>
                    <span class="result-value">${gridType.charAt(0).toUpperCase() + gridType.slice(1)}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Garden Area:</span>
                    <span class="result-value">${area.toFixed(1)} sq ft</span>
                </div>
            `;
            
            document.getElementById('spacing-output').innerHTML = output;
            document.getElementById('spacing-result').classList.add('show');
        }
        
        // WATERING CALCULATOR
        function calculateWatering() {
            const length = parseFloat(document.getElementById('water-length').value);
            const width = parseFloat(document.getElementById('water-width').value);
            const plantType = parseFloat(document.getElementById('plant-type').value);
            const soilType = parseFloat(document.getElementById('soil-type').value);
            const climateType = parseFloat(document.getElementById('climate-type').value);
            
            if (!length || !width) {
                alert('Please fill in all fields');
                return;
            }
            
            const area = length * width;
            const baseWater = area * plantType;
            const adjustedWater = baseWater * soilType * climateType;
            const perSession = adjustedWater / 2;
            const perSession3 = adjustedWater / 3;
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Weekly Water Needed:</span>
                    <span class="result-value">${adjustedWater.toFixed(1)} gallons</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Per Session (2x/week):</span>
                    <span class="result-value">${perSession.toFixed(1)} gallons</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Per Session (3x/week):</span>
                    <span class="result-value">${perSession3.toFixed(1)} gallons</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Garden Area:</span>
                    <span class="result-value">${area.toFixed(1)} sq ft</span>
                </div>
            `;
            
            document.getElementById('water-output').innerHTML = output;
            document.getElementById('water-result').classList.add('show');
        }
        
        // COMPOST CALCULATOR
        function calculateCompost() {
            const length = parseFloat(document.getElementById('compost-length').value);
            const width = parseFloat(document.getElementById('compost-width').value);
            const application = parseFloat(document.getElementById('compost-application').value);
            
            if (!length || !width) {
                alert('Please fill in all fields');
                return;
            }
            
            const area = length * width;
            const volume = area * (application / 12);
            const cubicYards = volume / 27;
            const bags = Math.ceil((volume / 27) * 27 / 2);
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Volume Needed:</span>
                    <span class="result-value">${cubicYards.toFixed(2)} cubic yards</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Cubic Feet:</span>
                    <span class="result-value">${volume.toFixed(2)} cu ft</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Bags Needed (2 cu ft):</span>
                    <span class="result-value">${bags} bags</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Coverage Area:</span>
                    <span class="result-value">${area.toFixed(1)} sq ft</span>
                </div>
            `;
            
            document.getElementById('compost-output').innerHTML = output;
            document.getElementById('compost-result').classList.add('show');
        }
        
        // FERTILIZER CALCULATOR
        function calculateFertilizer() {
            const length = parseFloat(document.getElementById('fert-length').value);
            const width = parseFloat(document.getElementById('fert-width').value);
            const cropType = document.getElementById('crop-type').value;
            const npkN = parseFloat(document.getElementById('npk-n').value) || 10;
            const npkP = parseFloat(document.getElementById('npk-p').value) || 10;
            const npkK = parseFloat(document.getElementById('npk-k').value) || 10;
            
            if (!length || !width) {
                alert('Please fill in garden dimensions');
                return;
            }
            
            const area = length * width;
            let lbsPerSqFt;
            
            switch(cropType) {
                case 'leafy': lbsPerSqFt = 0.10; break;
                case 'fruiting': lbsPerSqFt = 0.15; break;
                case 'root': lbsPerSqFt = 0.12; break;
                case 'flowers': lbsPerSqFt = 0.08; break;
                case 'lawn': lbsPerSqFt = 0.20; break;
                default: lbsPerSqFt = 0.12;
            }
            
            const totalLbs = area * lbsPerSqFt;
            const actualN = totalLbs * (npkN / 100);
            const actualP = totalLbs * (npkP / 100);
            const actualK = totalLbs * (npkK / 100);
            
            const output = `
                <div class="result-item">
                    <span class="result-label">Fertilizer Needed:</span>
                    <span class="result-value">${totalLbs.toFixed(2)} lbs</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Actual N (Nitrogen):</span>
                    <span class="result-value">${actualN.toFixed(2)} lbs</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Actual P (Phosphorus):</span>
                    <span class="result-value">${actualP.toFixed(2)} lbs</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Actual K (Potassium):</span>
                    <span class="result-value">${actualK.toFixed(2)} lbs</span>
                </div>
            `;
            
            document.getElementById('fert-output').innerHTML = output;
            document.getElementById('fert-result').classList.add('show');
        }
