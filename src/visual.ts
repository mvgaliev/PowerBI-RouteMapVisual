/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    import DataViewObjects = powerbi.DataViewObjects;
    import DataViewValueColumn = powerbi.DataViewValueColumn;

	import Selection = d3.Selection;
    import UpdateSelection = d3.selection.Update;

    import tooltip = powerbi.extensibility.utils.tooltip;
    import TooltipEnabledDataPoint = powerbi.extensibility.utils.tooltip.TooltipEnabledDataPoint;
    import TooltipEventArgs = powerbi.extensibility.utils.tooltip.TooltipEventArgs;
    import ITooltipServiceWrapper = powerbi.extensibility.utils.tooltip.ITooltipServiceWrapper;
    import createTooltipServiceWrapper = powerbi.extensibility.utils.tooltip.createTooltipServiceWrapper;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;
    import ValueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;

    // powerbi.extensibility.utils.svg
    import IMargin = powerbi.extensibility.utils.svg.IMargin;
    import translate = powerbi.extensibility.utils.svg.translate;
    import ClassAndSelector = powerbi.extensibility.utils.svg.CssConstants.ClassAndSelector;
    import createClassAndSelector = powerbi.extensibility.utils.svg.CssConstants.createClassAndSelector;

    // powerbi.extensibility.utils.type
    import pixelConverterFromPoint = powerbi.extensibility.utils.type.PixelConverter.fromPoint;

    // powerbi.extensibility.utils.formatting
    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;
    import textMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;

    const labelSelector = ".route-map-label";
    const labelClassName = "route-map-label";
    const markerClassName: string = "route-map-marker";
    export class Visual implements IVisual {

        private routeMapDataView: RouteMapDataView;
        private targetHtmlElement: HTMLElement;
        private hostContainer: JQuery;
        private map: any;
        private dataIsNotEmpty: boolean;
        private isDataValid: boolean = false;
        private selectionManager: ISelectionManager;
        private host: IVisualHost;
        private isFirstMultipleSelection: boolean = true;
        private tooltipServiceWrapper: ITooltipServiceWrapper;
        private markersTooltipsMap: { [key: string]: VisualTooltipDataItem[] };

        private root: Selection<any>;

        private settings: RouteMapSettings;

        constructor(options: VisualConstructorOptions) {
            this.init(options);
        }

        public init(options: VisualConstructorOptions): void {
            this.selectionManager = options.host.createSelectionManager();
            this.host = options.host;

            this.targetHtmlElement = options.element;

            this.addMapDivToDocument();
            this.tooltipServiceWrapper = createTooltipServiceWrapper(
                this.host.tooltipService,
                options.element);

            this.hostContainer = $(this.targetHtmlElement).css('overflow-x', 'hidden');

            this.root = d3.select(this.targetHtmlElement);
            this.initMap();
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            let objectName = options.objectName;
            let objectEnumeration: VisualObjectInstance[] = [];

            switch (objectName) {
                case 'routes':
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "Routes",
                        properties: {
                            arcColor: this.settings.routes.getArcColor(),
                            defaultThickness: this.settings.routes.defaultThickness,
                            minThickness: this.settings.routes.minThickness,
                            maxThickness: this.settings.routes.maxThickness
                        },
                        selector: null
                    });
                    break;
                case 'markers':
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "Markers",
                        properties: {
                            markerColor: this.settings.markers.getMarkerColor(),
                            labelFontColor: this.settings.markers.getLabelFontColor(),
                            radius: this.settings.markers.radius
                        },
                        selector: null
                    });
                    break;
                case 'state1':
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "State 1",
                        properties: {
                            stateColor: this.settings.state1.getStateColor()
                        },
                        selector: null
                    });
                    break;
                case 'state2':
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "State 2",
                        properties: {
                            stateColor: this.settings.state2.getStateColor()
                        },
                        selector: null
                    });
                    break;
                case 'state3':
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "State 3",
                        properties: {
                            stateColor: this.settings.state3.getStateColor()
                        },
                        selector: null
                    });
                    break;
            };

            return objectEnumeration;
        }

        private mapGotActiveSelections(): boolean {
            return this.selectionManager.hasSelection();
        }

        private addMapDivToDocument(): void {
            var div = document.createElement('div');
            div.setAttribute("id", "map");
            div.setAttribute("style", "height:550px");
            div.setAttribute("class", "none");

            this.targetHtmlElement.appendChild(div);
        }

        public initMap(): void {

            this.map = L.map('map').setView([33.9415839, -118.4435494], 3);

            //add map tile
            var layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
                        maxZoom: 18
            }).addTo(this.map);

            this.routeMapDataView = {
                markers: {},
                arcs: {},
                arcsLayer: L.featureGroup(),
                markersLayer: L.featureGroup()
            };

            this.setMapHandlers();
        }

        public update(options: VisualUpdateOptions): void {
            // render new data if dataset was changed
            if (options.type == VisualUpdateType.Data || options.type == VisualUpdateType.All) {
                let dataView: DataView = options
                    && options.dataViews
                    && options.dataViews[0];

                this.clearMap();
                this.routeMapDataView = this.converter(dataView);
                this.render();
            }

            let bounds = this.routeMapDataView.arcsLayer.getBounds();

            if(bounds && bounds.isValid()) {
                this.map.fitBounds(bounds);
            }

            this.map.invalidateSize();
            this.updateContainerViewports(options.viewport);
        }

        private parseSettings(dataView: DataView): RouteMapSettings {
            return RouteMapSettings.parse<RouteMapSettings>(dataView);
        }

        private midpointTo(pointFrom: L.LatLng, pointTo: L.LatLng): L.LatLng {
            return L.latLng((pointFrom.lat + pointTo.lat) / 2, (pointFrom.lng + pointTo.lng) / 2);
        };

        private getRoot(angleCoeficient: number, latitude: number, longitude: number, distance: number): number[] {

            var x0 = latitude;
            var y0 = longitude;

            var k1 = angleCoeficient;
            var k2 = -k1 * x0 + y0;

            var a = k1 * k1 + 1;
            var b = 2 * k1 * k2 - 2 * x0 - 2 * k1 * y0;
            var c = x0 * x0 + k2 * k2 - 2 * y0 * k2 + y0 * y0 - distance * distance;

            var d = b * b - 4 * a * c;

            var x1 = -b / ( 2 * a ) - Math.sqrt( d ) / ( 2 * a );
            var x2 = -b / ( 2 * a ) + Math.sqrt( d ) / ( 2 * a );

            let rootArray = [];
            rootArray.push(x1);
            rootArray.push(x2);

            return rootArray;
        }

        private getSpecialPointLatLng(fromLatLng: L.LatLng, toLatLng: L.LatLng, midLatLng: L.LatLng, isMinus360Lng?: boolean): L.LatLng {
            let midLat = midLatLng.lat;
            let midLng = midLatLng.lng;

            let ang1 = (toLatLng.lng - fromLatLng.lng) / (toLatLng.lat - fromLatLng.lat);
            let ang2 = -(toLatLng.lat - fromLatLng.lat) / (toLatLng.lng - fromLatLng.lng);

            let deltaLat = toLatLng.lat - midLatLng.lat;
            let deltaLng = toLatLng.lng - midLatLng.lng;

            let distance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng);

            distance = distance * Math.PI / 180 > 0.6 ? distance / 2 : distance;

            let latitudes = this.getRoot(ang2, midLat, midLng, distance);
            let lat = fromLatLng.lat > 0 && toLatLng.lat > 0 ? latitudes[1]: latitudes[0];
            let long = ((ang2 * (lat - midLat) + midLng) );

            return L.latLng(lat, long );
        }

        private createLine(direction: Direction, settings: RouteMapSettings): L.Polyline {
            let l: any = L;

            let pointFrom = direction.fromToLatLng.fromLatLng,
                pointTo = direction.fromToLatLng.toLatLng;

            let midpoint = this.midpointTo(pointFrom, pointTo);

            let stateValue = direction.stateValue;
            let color;

            if(stateValue !== undefined && stateValue !== null) {
                let state1Min = direction.stateValueMin1 !== null ? direction.stateValueMin1 : -Number.MAX_VALUE,
                    state1Max = direction.stateValueMax1 !== null ? direction.stateValueMax1 : Number.MAX_VALUE,
                    state2Min = direction.stateValueMin2 !== null ? direction.stateValueMin2 : -Number.MAX_VALUE,
                    state2Max = direction.stateValueMax2 !== null ? direction.stateValueMax2 : Number.MAX_VALUE,
                    state3Min = direction.stateValueMin3 !== null ? direction.stateValueMin3 : -Number.MAX_VALUE,
                    state3Max = direction.stateValueMax3 !== null ? direction.stateValueMax3 : Number.MAX_VALUE;

                if (stateValue <= state1Max && stateValue >= state1Min && state1Min !== -state1Max) {
                    color = settings.state1.getStateColor();
                } else if (stateValue <= state2Max && stateValue >= state2Min && state2Min !== -state2Max) {
                    color = settings.state2.getStateColor();
                } else if (stateValue <= state3Max && stateValue >= state3Min && state3Min !== -state3Max) {
                    color = settings.state3.getStateColor();
                } else {
                    color = settings.routes.getArcColor();
                }
            } else {
                color = settings.routes.getArcColor();
            }

            let thicknessOptions;
            if(direction.thicknessValue >= direction.thicknessMin && direction.thicknessValue <= direction.thicknessMax) {
                thicknessOptions = this.getThicknessOptions(direction);
            }

            let thickness = thicknessOptions
                        ? settings.routes.minThickness + (direction.thicknessValue - thicknessOptions.minValue) * thicknessOptions.coeficient
                        : settings.routes.defaultThickness;

            let line = L.polyline([pointFrom, pointTo], {color: color, weight: thickness} );

            return line;
        }

        public updateContainerViewports(viewport: IViewport) {
            // handle resize
            var width = viewport.width;
            var height = viewport.height;
            this.hostContainer.css({
                'height': height,
                'width': width
            });
            // resize map
            document.getElementById('map').style.width = viewport.width.toString() + "px";
            document.getElementById('map').style.height = viewport.height.toString() + "px";
        }

        private setLabelToElement(content: string, element: any): void {
            element.bindTooltip(content, { permanent: true, className: "route-map-label", offset: [0, 0] });
        }

        private setSelectionStyle(selected: boolean, element: L.Path): void {
            let opacity: number = selected ? 1 : 0.3;

            element.setStyle({
                opacity: opacity,
                fillOpacity: opacity
            });
        }

        private unselectAll(): void {
            let markers = this.routeMapDataView.markers;
            let arcs = this.routeMapDataView.arcs;

            for (var item in arcs) {
                arcs[item].isSelected = false;
                this.setSelectionStyle(true, arcs[item].arc);
            }

            for (var item in markers) {
                markers[item].isSelected = false;
                this.setSelectionStyle(true, markers[item].marker);
            }

            this.isFirstMultipleSelection = true;
        }

        private setOnMarkerClickEvent(element: L.CircleMarker): void {
            let me = this;

            element.on('click', function (e) {
                (e as L.MouseEvent).originalEvent.preventDefault();

                let markers = me.routeMapDataView.markers;
                let arcs = me.routeMapDataView.arcs;

                let arcSelectionIds: ISelectionId[] = [];

                let routeMapMarker: RouteMapMarker;

                for(var item in markers) {
                    if(markers[item].marker === this) {
                        routeMapMarker = markers[item];
                        break;
                    }
                }

                let isMultipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;

                if(!routeMapMarker || (routeMapMarker.isSelected && !isMultipleSelection)) {
                    return;
                }

                routeMapMarker.arcs.map((value) => {
                    if(!routeMapMarker.isSelected || value.isSelected) {
                        arcSelectionIds.push(value.selectionId);
                    }
                });

                me.selectionManager.select(arcSelectionIds, isMultipleSelection).then((ids: ISelectionId[]) => {

                    if (me.isFirstMultipleSelection || !isMultipleSelection) {
                        for (var item in arcs) {
                            arcs[item].isSelected = false;
                            me.setSelectionStyle(false, arcs[item].arc);
                        }

                        for (var item in markers) {
                            if (markers[item].marker !== this) {
                                markers[item].isSelected = false;
                                me.setSelectionStyle(false, markers[item].marker);
                            }
                        }

                        me.isFirstMultipleSelection = false;
                    }

                    routeMapMarker.isSelected = !routeMapMarker.isSelected;
                    me.setSelectionStyle(routeMapMarker.isSelected, routeMapMarker.marker);

                    routeMapMarker.arcs.forEach((item) => {
                        if (item.isSelected !== routeMapMarker.isSelected) {
                            item.isSelected = routeMapMarker.isSelected;
                            me.setSelectionStyle(item.isSelected, item.arc);

                            item.markers.forEach((marker) => {
                                if (marker !== routeMapMarker) {
                                    marker.isSelected = routeMapMarker.isSelected;
                                    me.setSelectionStyle(marker.isSelected, marker.marker);
                                }
                            });
                        }
                    });
                });
            });
        }

        private setOnArcClickEvent(element: L.Polyline) {
            let me = this;

            element.on('click', function (e) {
                (e as L.MouseEvent).originalEvent.preventDefault();

                let markers = me.routeMapDataView.markers;
                let arcs = me.routeMapDataView.arcs;

                let routeMapArc: RouteMapArc;

                for(var item in arcs) {
                    if(arcs[item].arc === this) {
                        routeMapArc = arcs[item];
                        break;
                    }
                }

                let isMultipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;

                if(!routeMapArc || (routeMapArc.isSelected && !isMultipleSelection)) {
                    return;
                }

                let selectedId: ISelectionId = routeMapArc.selectionId;

                me.selectionManager.select(selectedId, isMultipleSelection).then((ids: ISelectionId[]) => {

                    if(me.isFirstMultipleSelection || !isMultipleSelection) {
                        for (var item in markers) {
                            markers[item].isSelected = false;
                            me.setSelectionStyle(false, markers[item].marker);
                        }

                        for (var item in arcs) {
                            if (arcs[item].arc !== this) {
                                arcs[item].isSelected = false;
                                me.setSelectionStyle(false, arcs[item].arc);
                            }
                        }

                        me.isFirstMultipleSelection = false;
                    }

                    routeMapArc.isSelected = !routeMapArc.isSelected;
                    me.setSelectionStyle(routeMapArc.isSelected, routeMapArc.arc);

                    routeMapArc.markers.forEach((item: RouteMapMarker) => {
                        let markerGotSelectedElements = false;

                        for(var i in item.arcs) {
                            if(item.arcs[i].isSelected == true) {
                                markerGotSelectedElements = true;
                                break;
                            }
                        }

                        if(markerGotSelectedElements !== item.isSelected) {
                            item.isSelected = !item.isSelected;
                            me.setSelectionStyle(item.isSelected, item.marker);
                        }
                    });
                });
            });
        }

        private createCustomizableMarker(latLng: L.LatLng, settings: RouteMapSettings): L.CircleMarker {
            let marker = L.circleMarker(latLng, {
                color: settings.markers.getMarkerColor(),
                fillColor:  settings.markers.getMarkerColor(),
                fillOpacity: 1,
                radius: settings.markers.radius,
                className: markerClassName
            });

            return marker;
        }

        private setLabelFontColor(color: string) {
            $(labelSelector).css("color", color);
        }

        public render(): void {
            this.map.addLayer(this.routeMapDataView.arcsLayer);
            this.map.addLayer(this.routeMapDataView.markersLayer);

            this.setLabelFontColor(this.settings.markers.getLabelFontColor());

            this.tooltipServiceWrapper.addTooltip<TooltipEnabledDataPoint>(this.getArcsSelection(),(tooltipEvent: TooltipEventArgs<TooltipEnabledDataPoint>) => {
                return tooltipEvent.data.tooltipInfo;
            });

            this.tooltipServiceWrapper.addTooltip<TooltipEnabledDataPoint>(this.getMarkersSelection(),(tooltipEvent: TooltipEventArgs<TooltipEnabledDataPoint>) => {
                return tooltipEvent.data.tooltipInfo;
            });
        }

        private getArcsSelection(): UpdateSelection<RouteMapArc> {
            let arcsSelection: UpdateSelection<RouteMapArc>;
			let arcsElements: Selection<RouteMapArc>;

			arcsElements = this.root.select("g").selectAll(".leaflet-interactive");

            let array = [];

            for(var item in this.routeMapDataView.arcs) {
                array.push(this.routeMapDataView.arcs[item]);
            }

			arcsSelection = arcsElements.data(array.filter((arc) => {
                return arc.tooltipInfo.length > 0;
            }));

            return arcsSelection;
        }

        private getMarkersSelection(): UpdateSelection<RouteMapMarker> {
            let markersSelection: UpdateSelection<RouteMapMarker>;
			let markersElements: Selection<RouteMapMarker>;

			markersElements = this.root.select("g").selectAll("." + markerClassName);

            let array = [];

            for(var item in this.routeMapDataView.markers) {
                array.push(this.routeMapDataView.markers[item]);
            }

			markersSelection = markersElements.data(array);

            return markersSelection;
        }

        public clearMap(): void {
            let dataView = this.routeMapDataView;
            if (dataView && dataView.arcsLayer && dataView.markersLayer) {
                dataView.arcsLayer.clearLayers();
                dataView.markersLayer.clearLayers();
            }
        }

        private parseDataViewToDirections(dataView: DataView): Direction[] {
            let directions: Direction[] = [];
            let parsedMarkerTooltipsMap: {[key:string]:VisualTooltipDataItem[]} = {};

            let codesFrom: any[] = dataView.categorical.categories[1].values,
                codesTo: any[] = dataView.categorical.categories[2].values,
                markets: any[] = dataView.categorical.categories[0].values;

            let latsFrom: any[] = dataView.categorical.values[0].values,
                latsTo: any[] = dataView.categorical.values[2].values,
                longsFrom: any[] = dataView.categorical.values[1].values,
                longsTo: any[] = dataView.categorical.values[3].values,
                stateValues: any[],
                stateValuesMin1: any[],
                stateValuesMax1: any[],
                stateValuesMin2: any[],
                stateValuesMax2: any[],
                stateValuesMin3: any[],
                stateValuesMax3: any[],
                thicknessValues: any[],
                thicknessValuesMin: any[],
                thicknessValuesMax: any[];

            let tooltipColumns: DataViewValueColumn[] = [];
            let sourceTooltipColumns: DataViewValueColumn[] = [];
            let destTooltipColumns: DataViewValueColumn[] = [];

            for(var i in dataView.categorical.values) {
                let column = dataView.categorical.values[i];
                if(column.source && column.source.roles["tooltips"]) {
                    tooltipColumns.push(column);
                }

                if(column.source && column.source.roles["sourceTooltips"]) {
                    sourceTooltipColumns.push(column);
                }

                if(column.source && column.source.roles["destTooltips"]) {
                    destTooltipColumns.push(column);
                }

                if(column.source && column.source.roles["stateValue"]) {
                    stateValues = column.values;
                }

                if(column.source && column.source.roles["stateValueMin1"]) {
                    stateValuesMin1 = column.values;
                }

                if(column.source && column.source.roles["stateValueMax1"]) {
                    stateValuesMax1 = column.values;
                }

                if(column.source && column.source.roles["stateValueMin2"]) {
                    stateValuesMin2 = column.values;
                }

                if(column.source && column.source.roles["stateValueMax2"]) {
                    stateValuesMax2 = column.values;
                }

                if(column.source && column.source.roles["stateValueMin3"]) {
                    stateValuesMin3 = column.values;
                }

                if(column.source && column.source.roles["stateValueMax3"]) {
                    stateValuesMax3 = column.values;
                }

                if(column.source && column.source.roles["thicknessValue"]) {
                    thicknessValues = column.values;
                }

                if(column.source && column.source.roles["thicknessMin"]) {
                    thicknessValuesMin = column.values;
                }

                if(column.source && column.source.roles["thicknessMax"]) {
                    thicknessValuesMax = column.values;
                }
            }

            markets.forEach((item: any, index: number) => {
                let tooltipInfo: VisualTooltipDataItem[] = Visual.GetTooltipInfo(tooltipColumns, index);
                let sourceTooltipInfo: VisualTooltipDataItem[] = Visual.GetTooltipInfo(sourceTooltipColumns, index);
                let destTooltipInfo: VisualTooltipDataItem[] = Visual.GetTooltipInfo(destTooltipColumns, index);

                parsedMarkerTooltipsMap[codesFrom[index]] = parsedMarkerTooltipsMap[codesFrom[index]] ? parsedMarkerTooltipsMap[codesFrom[index]].concat(sourceTooltipInfo) : sourceTooltipInfo;
                parsedMarkerTooltipsMap[codesTo[index]] = parsedMarkerTooltipsMap[codesTo[index]] ? parsedMarkerTooltipsMap[codesTo[index]].concat(destTooltipInfo) : destTooltipInfo;

                let fromToLatLng = this.getActualFromToLatLng(latsFrom[index], longsFrom[index], latsTo[index], longsTo[index]);

                if(fromToLatLng !== null) {
                    directions.push({
                        market: markets[index],
                        index: index,
                        locationFrom: codesFrom[index],
                        locationTo: codesTo[index],
                        fromToLatLng: fromToLatLng,
                        stateValue: stateValues ? stateValues[index] : null,
                        stateValueMin1: stateValuesMin1 ? stateValuesMin1[index] : null,
                        stateValueMax1: stateValuesMax1 ? stateValuesMax1[index] : null,
                        stateValueMin2: stateValuesMin2 ? stateValuesMin2[index] : null,
                        stateValueMax2: stateValuesMax2 ? stateValuesMax2[index] : null,
                        stateValueMin3: stateValuesMin3 ? stateValuesMin3[index] : null,
                        stateValueMax3: stateValuesMax3 ? stateValuesMax3[index] : null,
                        thicknessValue: thicknessValues ? thicknessValues[index] : null,
                        thicknessMax: thicknessValuesMax ? thicknessValuesMax[index] : null,
                        thicknessMin: thicknessValuesMin ? thicknessValuesMin[index] : null,
                        tooltipInfo: tooltipInfo
                    });
                }
            });

            this.markersTooltipsMap = parsedMarkerTooltipsMap;
            return directions;
        }

        private static GetTooltipInfo(columns: DataViewValueColumn[], valueIndex: number): VisualTooltipDataItem[] {
            let routeTooltipInfo: VisualTooltipDataItem[] = [];
            columns.forEach((column) => {
                let format = ValueFormatter.getFormatStringByColumn(column.source, true),
                    name = column.source.displayName,
                    value = column.values[valueIndex] ? column.values[valueIndex] : "";

                routeTooltipInfo.push({ displayName: name, value: ValueFormatter.format(value, format) });
            });
            return routeTooltipInfo;
        }

        private getThicknessOptions(direction: Direction): ThicknessOptions {

            if(!this.settings.routes.minThickness || !this.settings.routes.maxThickness || !direction.thicknessMin || !direction.thicknessMax) {
                return null;
            }

            let minValue = direction.thicknessMin,
                maxValue = direction.thicknessMax;

            let coef = (this.settings.routes.maxThickness - this.settings.routes.minThickness) / (maxValue - minValue);

            if(coef === Number.NaN) {
                return null;
            }

            return {
                coeficient: coef,
                minValue: minValue
            };
        }

        private getDistance(fromLatLng: L.LatLng, toLatLng: L.LatLng): number {
            let deltaLat = toLatLng.lat - fromLatLng.lat;
            let deltaLng = toLatLng.lng - fromLatLng.lng;

            return Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng)* Math.PI / 180;
        }

        private getActualFromToLatLng(fromLat: number, fromLng: number, toLat: number, toLng: number): FromToLatLng {

            if(fromLat === null || fromLng === null || toLat === null || toLng == null) {
                return null;
            }

            let fromLatLng = L.latLng(fromLat, fromLng),
                toLatLng = L.latLng(toLat, toLng),
                fromLatLng360 = L.latLng(fromLatLng.lat, fromLatLng.lng - 360),
                toLatLng360 = L.latLng(toLatLng.lat, toLatLng.lng - 360);

            let distance1 = this.getDistance(fromLatLng, toLatLng),
                distance2 = this.getDistance(fromLatLng360, toLatLng),
                distance3 = this.getDistance(fromLatLng, toLatLng360),
                distance4 = this.getDistance(fromLatLng360, toLatLng360);

            let minDistance = distance1,
                fromToLatLng = { toLatLng: toLatLng, fromLatLng: fromLatLng, isFromLngMinus360: false, isToLngMinus360: false };

            if(distance2 < minDistance){
                minDistance = distance2;
                fromToLatLng.toLatLng = toLatLng;
                fromToLatLng.fromLatLng = fromLatLng360;
                fromToLatLng.isFromLngMinus360 = true;
                fromToLatLng.isToLngMinus360 = false;
            }

            if(distance3 < minDistance){
                minDistance = distance3;
                fromToLatLng.toLatLng = toLatLng360;
                fromToLatLng.fromLatLng = fromLatLng;
                fromToLatLng.isFromLngMinus360 = false;
                fromToLatLng.isToLngMinus360 = true;
            }

            if(distance4 < minDistance && !(toLatLng360.lng < -180 && fromLatLng360.lng < -180)){
                minDistance = distance4;
                fromToLatLng.toLatLng = toLatLng360;
                fromToLatLng.fromLatLng = fromLatLng360;
                fromToLatLng.isFromLngMinus360 = true;
                fromToLatLng.isToLngMinus360 = true;
            }

            return fromToLatLng;
        }

        private createRouteMapArc(direction: Direction,
                                       settings: RouteMapSettings,
                                       selectionCategoryColumn: DataViewCategoricalColumn): RouteMapArc {

            let locationFrom = direction.locationFrom,
                locationTo = direction.locationTo;

            let arc = this.createLine(direction, settings);

            this.setOnArcClickEvent(arc);

            let selectionId = this.host.createSelectionIdBuilder()
                .withCategory(selectionCategoryColumn, direction.index)
                .createSelectionId();

            return {
                arc: arc,
                markers: [],
                tooltipInfo: direction.tooltipInfo,
                isSelected: false,
                selectionId: selectionId
            };
        }

        private createRouteMapMarker(direction: Direction, isDestinationPoint: boolean, latLng: L.LatLng, settings: RouteMapSettings): RouteMapMarker {
            let marker = this.createCustomizableMarker(latLng, settings);

            let label = isDestinationPoint ? direction.locationTo : direction.locationFrom;
            this.setLabelToElement(label.toString(), marker);

            let lat = isDestinationPoint ? direction.fromToLatLng.toLatLng.lat : direction.fromToLatLng.fromLatLng.lat;
            let long = isDestinationPoint ? direction.fromToLatLng.toLatLng.lng : direction.fromToLatLng.fromLatLng.lng;

            this.setOnMarkerClickEvent(marker);

            let tooltipInfo = this.markersTooltipsMap[label].length > 0 ? this.markersTooltipsMap[label] : null;            

            return {                
                marker: marker,
                arcs: [],
                location: label,
                tooltipInfo: tooltipInfo,
                isSelected: false
            };
        }

        private limitProperties(settings: RouteMapSettings) {
            let radius = settings.markers.radius;

            if(radius > RouteMapMarkersSettings.maximumPossibleRadius) {
                radius = RouteMapMarkersSettings.maximumPossibleRadius;
            } else if(radius < RouteMapMarkersSettings.minimunPossibleRadius) {
                radius = RouteMapMarkersSettings.minimunPossibleRadius;
            }

            settings.markers.radius = radius;

            let defaultThickness = settings.routes.defaultThickness;

            if(defaultThickness > RouteMapRoutesSettings.maximumPossibleThickness) {
                defaultThickness = RouteMapRoutesSettings.maximumPossibleThickness;
            } else if(defaultThickness < RouteMapRoutesSettings.minimumPossibleThickness) {
                defaultThickness = RouteMapRoutesSettings.minimumPossibleThickness;
            }

            settings.routes.defaultThickness = defaultThickness;

            let minThickness = settings.routes.minThickness;

            if(minThickness > RouteMapRoutesSettings.maximumPossibleThickness) {
                minThickness = RouteMapRoutesSettings.maximumPossibleThickness;
            } else if(minThickness < RouteMapRoutesSettings.minimumPossibleThickness) {
                minThickness = RouteMapRoutesSettings.minimumPossibleThickness;
            }

            settings.routes.minThickness = minThickness;

            let maxThickness = settings.routes.maxThickness;

            if(maxThickness > RouteMapRoutesSettings.maximumPossibleThickness) {
                maxThickness = RouteMapRoutesSettings.maximumPossibleThickness;
            } else if(maxThickness < RouteMapRoutesSettings.minimumPossibleThickness) {
                maxThickness = RouteMapRoutesSettings.minimumPossibleThickness;
            }

            settings.routes.maxThickness = maxThickness;
        }

        public converter(dataView: DataView): RouteMapDataView {

            this.isDataValid = false;
            let settings = this.settings = this.parseSettings(dataView);
            this.limitProperties(settings);

            if (!dataView
                || !dataView.categorical
                || !dataView.categorical.categories
                || !dataView.categorical.categories[0]
                || !dataView.categorical.categories[1]
                || !dataView.categorical.categories[2]
                || !dataView.categorical.categories[0].values
                || !dataView.categorical.categories[1].values
                || !dataView.categorical.categories[2].values
                || !dataView.categorical.values
                || !dataView.categorical.values[0]
                || !dataView.categorical.values[1]
                || !dataView.categorical.values[2]
                || !dataView.categorical.values[3]
                || dataView.categorical.values[3].source.roles["tooltips"]) {

                return {
                    arcs: {},
                    arcsLayer: L.featureGroup(),
                    markers: {},
                    markersLayer: L.featureGroup()
                };
            }

            let directions = this.parseDataViewToDirections(dataView);

            let marketCategory = dataView.categorical.categories[0];

            let processedArcs: RouteMapArcList = {},
                createdMarkers: RouteMapMarkerList = {},
                createdMarkers360: RouteMapMarkerList = {};

            let markersLayer: L.FeatureGroup = L.featureGroup(),
                arcsLayer: L.FeatureGroup = L.featureGroup();

            for (var item in directions) {
                let direction = directions[item];
                let keyArc = direction.market,
                    keyFrom = direction.locationFrom,
                    keyTo = direction.locationTo;

                if(!keyArc || !keyFrom || !keyTo) {
                    continue;
                }

                let isFromLngMinus360 = direction.fromToLatLng.isFromLngMinus360,
                    isToLngMinus360 = direction.fromToLatLng.isToLngMinus360;

                let routeMapArc = this.createRouteMapArc(direction, settings, marketCategory);

                processedArcs[keyArc] = routeMapArc;
                arcsLayer.addLayer(routeMapArc.arc);

                let routeMapMarkerFrom: RouteMapMarker,
                    routeMapMarkerTo: RouteMapMarker;


                if (!createdMarkers[keyFrom] && !isFromLngMinus360) {
                    let fromLatLng = direction.fromToLatLng.fromLatLng;
                    routeMapMarkerFrom = this.createRouteMapMarker(direction, false, fromLatLng, settings);

                    createdMarkers[keyFrom] = routeMapMarkerFrom;
                } else if(!createdMarkers360[keyFrom] && isFromLngMinus360) {
                    let fromLatLng = direction.fromToLatLng.fromLatLng;
                    routeMapMarkerFrom = this.createRouteMapMarker(direction, false, fromLatLng, settings);

                    createdMarkers360[keyFrom] = routeMapMarkerFrom;
                } else if(createdMarkers[keyFrom] && !isFromLngMinus360) {
                    routeMapMarkerFrom = createdMarkers[keyFrom];
                } else if(createdMarkers360[keyFrom] && isFromLngMinus360) {
                    routeMapMarkerFrom = createdMarkers360[keyFrom];
                }

                if (!createdMarkers[keyTo] && !isToLngMinus360) {
                    let toLatLng = direction.fromToLatLng.toLatLng;
                    routeMapMarkerTo = this.createRouteMapMarker(direction, true, toLatLng, settings);

                    createdMarkers[keyTo] = routeMapMarkerTo;

                } else if(!createdMarkers360[keyTo] && isToLngMinus360) {
                    let toLatLng = direction.fromToLatLng.toLatLng;
                    routeMapMarkerTo = this.createRouteMapMarker(direction, true, toLatLng, settings);
                    createdMarkers360[keyTo] = routeMapMarkerTo;

                } else if(createdMarkers[keyTo] && !isToLngMinus360) {
                    routeMapMarkerTo = createdMarkers[keyTo];
                } else if(createdMarkers360[keyTo] && isToLngMinus360) {
                    routeMapMarkerTo = createdMarkers360[keyTo];
                }

                if(!isFromLngMinus360) {
                    createdMarkers[keyFrom].arcs.push(routeMapArc);
                } else {
                    createdMarkers360[keyFrom].arcs.push(routeMapArc);
                }

                if(!isToLngMinus360) {
                    createdMarkers[keyTo].arcs.push(routeMapArc);
                } else {
                    createdMarkers360[keyTo].arcs.push(routeMapArc);
                }

                processedArcs[keyArc].markers.push(routeMapMarkerFrom);
                processedArcs[keyArc].markers.push(routeMapMarkerTo);
            }

            let processedMarkers: RouteMapMarkerList = createdMarkers;

            for(var item in createdMarkers) {
                markersLayer.addLayer(createdMarkers[item].marker);
            }

            for(var item in createdMarkers360) {
                let currentMarker = createdMarkers360[item];

                if(processedMarkers[item]) {
                    let processedMarker = processedMarkers[item];
                    let arcsArray = processedMarker.arcs.concat(currentMarker.arcs);

                    processedMarker.arcs = arcsArray;
                    currentMarker.arcs = arcsArray;

                    processedMarkers[item + "_360"] = currentMarker;

                } else {
                    processedMarkers[item + "_360"] = currentMarker;
                }

                markersLayer.addLayer(processedMarkers[item + "_360"].marker);
            }

            this.isDataValid = true;

            return {
                arcs: processedArcs,
                markers: processedMarkers,
                markersLayer: markersLayer,
                arcsLayer: arcsLayer
            };
        }

        private handleMove(): void {
            if (!this.isDataValid) {
                return;
            }

            let markers = this.routeMapDataView.markers;
        }

        private setMapHandlers(): void {
            let me = this;

            this.map.on('zoom', function (e) {
                me.handleMove();
            });

            this.map.on('moveend', function (e) {
                me.handleMove();
            });

            this.map.on('click', function (e) {
                let multipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;
                let defaultPrevented = (e as L.MouseEvent).originalEvent.defaultPrevented;

                if(multipleSelection || defaultPrevented) {
                    return;
                }

                if (me.mapGotActiveSelections()) {
                    me.selectionManager.clear().then(() => {
                        me.unselectAll();
                    });
                }
            });
        }
    }
}