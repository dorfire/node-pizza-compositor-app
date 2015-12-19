/// <reference path="../../typings/tsd.d.ts" />

module PizzaCompositor {
	const SLICES_IN_PIE = 8;

	/**
	 * Module globals
	 */
	var AppLink: SocketIOClient.Socket;


	function compileTemplate(name: string) {
		var tplSrc = document.getElementById('tpl-' + name).textContent;
		console.debug('Compiling template ' + name);
		return Handlebars.compile(tplSrc);
	}

	const Templates = {
		ToppingOption: compileTemplate('toppings-li'),
		OrderRequest: compileTemplate('order-request')
	}

	const ToppingOptions: string[] = [
		'Green Olives', 'Black Olives', 'Mushrooms', 'Onions', 'Corn', 'Peppers',
		'Xtra Cheese', 'Mozzarella', 'Spinach', 'Tomatoes', 'Pepperoni', 'Bacon',
		'Tuna', 'Anchovies', 'Pineapple'
	];


	interface ILinkStatus
	{
		error: any;
		connections: number;
	}

	/**
	 * Represents a pizza slice request from a single person.
	 */
	class RequestModel extends Backbone.Model
	{
		defaults()
		{
			return {
				name: '',
				slices: 2,
				approx: false,
				toppingOptions: ToppingOptions,
				toppings: []
			};
		}

		/**
		 * Sends model to server, without `toppingOptions` field
		 */
		sync()
		{
			var data = this.toJSON();
			
			delete data.toppingOptions;
			delete data.color;

			if (data.name) // Don't send without a name
				AppLink.emit('upsert', data);
		}
	}
	RequestModel.prototype.idAttribute = 'name';


	class RequestCollection extends Backbone.Collection<RequestModel>
	{
		model = RequestModel;

		getSliceCount(): number
		{
			return this.reduce((memo, req: RequestModel, i) => { return memo + req.get('slices'); }, 0);
		}
	}

	class CompositionView extends Marionette.ItemView<RequestModel>
	{
		template = false;
		el = 'form';

		ui = {
			sliceInput: 'input#slices',
			approxCheckbox: 'input#approx'
		};

		events = {
			'change input#name': this.changeRequest,
			'change input#slices': this.onChangedSlices,
			'change input#approx': this.onCheckedApprox,
			'change #toppings input': this.onCheckedTopping,
		};

		modelEvents = { change: this.upsert };

		onBeforeRender()
		{
			var toppingList = this.$el.find('ul#toppings');
			for (let name of ToppingOptions)
				toppingList.append(Templates.ToppingOption(name));
		}

		changeRequest(e)
		{
			var name: string = e.target.value;
			var existingRequest = this.getOption('requestCollection').get(name);

			if (existingRequest)
				this.model = existingRequest;
			else
				this.model = new RequestModel({ name: name });

			this.bindEntityEvents(this.model, this.getOption('modelEvents'));
			this.updateViewFields();
		}

		onChangedSlices(e)
		{
			var sliceCount = +e.target.value;
			this.model.set('slices', sliceCount);

			if (sliceCount == 1)
				this.ui.approxCheckbox.attr('checked', false);

			this.ui.approxCheckbox.attr('disabled', (sliceCount == 1));
		}

		getToppingListItemByName(name: string): JQuery
		{
			return this.$el.find(`#toppings li[data-id="${name}"]`);
		}

		onCheckedTopping(e)
		{
			var name: string = e.target.value;
			if (this.model.get('toppingOptions').indexOf(name) == -1)
				throw new RangeError(`${name} not a valid topping option`);

			var $li: JQuery = this.getToppingListItemByName(name);
			var add: boolean = e.target.checked;

			var toppings: string[] = _.clone(this.model.get('toppings'));
			var i = toppings.indexOf(e.target.value); // Selection index

			// Either remove or add to the array of selected toppings in the request model
			if (add && i == -1)
				toppings.push(name);
			else if (!add && i != -1)
				toppings.splice(i, 1);
			this.model.set('toppings', toppings);

			// Not really necessary but improves interface responsiveness:
			var pillCount = parseInt($li.find('span.label-pill').text());
			if (add) pillCount += this.model.get('slices');
			else pillCount -= this.model.get('slices');
			this.updateToppingCounter($li, pillCount);
		}

		/**
		 * Updates the counter pill next to a topping.
		 */
		updateToppingCounter($topping: JQuery, count: number): void
		{
			if (count > 0)
				$topping.find('span.label-pill').text(count);
		}

		onCheckedApprox(e)
		{
			this.model.set('approx', e.target.checked);
		}

		/**
		 * Reset form according to bound model
		 */
		updateViewFields()
		{
			this.ui.sliceInput.val(this.model.get('slices'));
			this.ui.approxCheckbox.attr('checked', this.model.get('approx'));
			
			var selectedToppings = this.model.get('toppings');
			var toppingCheckboxes = this.$el.find('#toppings input[type=checkbox]');
			toppingCheckboxes.each(function(i: number, checkbox: HTMLInputElement)
			{
				checkbox.checked = (selectedToppings.indexOf(checkbox.value) != -1);
			});
		}

		upsert()
		{
			console.log('upsert() due to changed attrs:', this.model.changed);
			this.model.save();
		}
	}

	class PizzaView extends Marionette.ItemView<Backbone.Model>
	{
		template = false;

		collection: RequestCollection;
		ctx: CanvasRenderingContext2D;
		padding: number = 10;
		sliceAngle: number = 2 * Math.PI / SLICES_IN_PIE;

		/**
		 * @param {number} cx		line origin X
		 * @param {number} cy		line origin Y
		 * @param {number} r		circle radius
		 * @param {number} a		line angle
		 * @param {boolean} fill	should the slice be filled with color
		 */
		strokeCircleRadius(cx: number, cy: number, r: number, a: number)
		{
			this.ctx.beginPath();
			this.ctx.moveTo(cx, cy);
			this.ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
			this.ctx.stroke();
			this.ctx.closePath();
		}

		fillCircleSlice(cx: number, cy: number, r: number, a1: number, a2: number, style: string)
		{
			this.ctx.beginPath();
			this.ctx.moveTo(cx, cy);
			this.ctx.arc(cx, cy, r, a1, a2);
			this.ctx.fillStyle = style;
			this.ctx.fill();
			this.ctx.closePath();
		}

		strokeCircle(cx: number, cy: number, r: number, lineWidth: number)
		{
			this.ctx.beginPath();
			this.ctx.arc(cx, cy, r, 0, 2 * Math.PI);
			this.ctx.lineWidth = lineWidth;
			this.ctx.stroke();
			this.ctx.closePath();
		}

		private currentRequestIndex: number;
		private currentRequest: RequestModel;
		private currentRequestSlices: number;

		private nextRequest()
		{
			this.currentRequest = this.collection.at(++this.currentRequestIndex);
			if (this.currentRequest)
				this.currentRequestSlices = this.currentRequest.get('slices');
		}

		drawPie(i: number, slicesInPie: number)
		{
			var r = (this.el.height / 2) * 0.9 - 1;
			var p = this.padding + r;
			var cx = p + i*2*p;
			console.debug(cx, p, r, slicesInPie);

			this.strokeCircle(cx, p, r, 3);

			this.ctx.lineWidth = 2;
			var innerR = r - this.ctx.lineWidth;

			for (var j = 1; j <= slicesInPie; ++j)
			{
				this.fillCircleSlice(cx, p, innerR, (j - 1) * this.sliceAngle, j * this.sliceAngle, this.currentRequest.get('color'));
				--this.currentRequestSlices;

				if (j == 1)
					this.strokeCircleRadius(cx, p, innerR, 0);
				if (j != SLICES_IN_PIE)
					this.strokeCircleRadius(cx, p, innerR, j * this.sliceAngle);

				if (this.currentRequestSlices == 0)
					this.nextRequest();
			}
		}

		drawPies()
		{
			var slices = this.collection.getSliceCount();
			var pies = slices / SLICES_IN_PIE;

			var slicesInLastPie = slices % SLICES_IN_PIE;
			if (slicesInLastPie == 0)
				slicesInLastPie = SLICES_IN_PIE;

			this.currentRequestIndex = -1;
			this.nextRequest();

			this.resetCanvas();
			for (let i = 0; i < pies; ++i)
			{
				this.drawPie(i, (pies > 1 && i < pies-1) ? SLICES_IN_PIE : slicesInLastPie);
			}
		}

		resetCanvas()
		{
			this.ctx.clearRect(0, 0, this.el.width, this.el.height);
		}

		onShow()
		{
			this.ctx = this.el.getContext('2d');
			this.onWindowResize(null);
			$(window).on('resize', this.onWindowResize.bind(this));
		}

		onWindowResize(e)
		{
			this.el.width = this.$el.parent().width();
			this.drawPies();
		}
	}

	class OrderRequestView extends Marionette.ItemView<RequestModel>
	{
		template = Templates.OrderRequest;
	}

	/**
	 * Represents a region that already has some existing markup in place.
	 */
	class ExistingMarkupRegion extends Marionette.Region
	{
		attachHtml() { /* no-op */ }
	}

	class OrderView extends Marionette.LayoutView<Backbone.Model>
	{
		template = false;

		regionClass = ExistingMarkupRegion;
		regions = {
			pizza: '#region-pizza',
			requests: '#region-requests'
		};

		collectionEvents = {
			'add': this.onRequestAdded
		};

		static REQUEST_COLORS = [
			'#4A9586', '#B96F6F', '#FF800D', '#1FCB4A',
			'#6A6AFF', '#23819C', '#FF62B0', '#FF5353'
		];

		onShow()
		{
			var requestCollection: RequestCollection = this.getOption('collection');

			var requestCollectionView = new Marionette.CollectionView({
				el: 'dl',
				collection: requestCollection,
				childView: OrderRequestView,
				collectionEvents: { 'change': 'render' },
			});
			this.showChildView('requests', requestCollectionView);

			var pizzaView = new PizzaView({
				el: this.getRegion('pizza').el,
				collection: requestCollection,
				collectionEvents: { 'change': 'drawPies' }
			});
			this.showChildView('pizza', pizzaView);
		}

		onRequestAdded(req: RequestModel)
		{
			// Silent so the request won't be rendered twice
			req.set('color', OrderView.REQUEST_COLORS[this.collection.indexOf(req)], { silent: true });
			// change:collection won't be triggered, so initiate pie drawing manually 
			this.getRegion('pizza').currentView.drawPies();
		}
	}

	class RootView extends Marionette.LayoutView<Backbone.Model>
	{
		template = false;
		el = '#app';

		ui = {
			titleBar: 'header #title-bar',
			status: 'header h1 small',
			navBar: 'header nav.navbar',
			mainContainer: 'main'
		};

		events = {
			'click nav li a': this.showRegion
		}

		regionClass = ExistingMarkupRegion;
		regions = {
			composition: '#region-composition',
			order: '#region-order'
		};

		navBarHidden: boolean;
		initalizedRegionTransitions: boolean;
		activeRegion: string;

		getRegionNameByAnchor($a)
		{
			return $a.attr('href').split('-')[1];
		}

		onRender() // According to documentation, should be onShow()
		{
			var compView = new CompositionView({ model: new RequestModel(), requestCollection: this.getOption('collection') });
			compView.constructor(); // Hack: binds events and ui
			this.showChildView('composition', compView);

			var orderView = new OrderView({ el: this.getRegion('order').el, collection: this.getOption('collection') });
			orderView.constructor(); // Hack: binds events and regions
			this.showChildView('order', orderView);

			this.initalizedRegionTransitions = false;
			this.onWindowResize(null);
			$(window).on('scroll', this.onWindowScroll.bind(this));
			$(window).on('resize', this.onWindowResize.bind(this));
		}

		/**
		 * Make the navbar fixed or static, depending on viewport offset.
		 */
		onWindowScroll(e)
		{
			if (this.navBarHidden) return;

			var scrollTop = $(window).scrollTop();
			var titleBarHeight = this.ui.titleBar.outerHeight();

			if (scrollTop > titleBarHeight)
			{
				this.ui.navBar.addClass('navbar-fixed-top');
				this.ui.titleBar.css('margin-bottom', this.ui.navBar.outerHeight());
			}
			if (scrollTop < titleBarHeight+1)
			{
				this.ui.navBar.removeClass('navbar-fixed-top');
				this.ui.titleBar.css('margin-bottom', 0);
			}
		}

		onWindowResize(e)
		{
			this.navBarHidden = this.ui.navBar.is(':hidden');

			if (!this.navBarHidden && !this.initalizedRegionTransitions)
			{
				this.activeRegion = this.getRegionNameByAnchor(this.ui.navBar.find('li.active a'));
				this.translateRegions();
				this.ui.mainContainer.addClass('translated');
				this.initalizedRegionTransitions = true;
			}
			else if (this.navBarHidden && this.initalizedRegionTransitions)
			{
				this.ui.mainContainer.removeClass('translated');
				for (let name of _.keys(this.regions))
				{
					var region = this.getRegion(name);
					region.$el.css('transform', 'none');
				}
				this.initalizedRegionTransitions = false;
			}
		}

		/**
		 * Translates all regions for transitions
		 */
		translateRegions()
		{
			var regionNames = _.keys(this.regions);
			var activeRegionIndex = regionNames.indexOf(this.activeRegion);

			var offsetTop = 0;
			for (let i in regionNames)
			{
				var region = this.getRegion(regionNames[i]);

				if (_.isUndefined(region.$el.data('offsetY')))
				{
					region.$el.data('offsetY', -offsetTop);
					offsetTop += region.$el.outerHeight();
				}
				
				var iRevesed = i - activeRegionIndex;
				var translations = `translateX(${100 * iRevesed}%) translateY(${region.$el.data('offsetY')}px)`;
				region.$el.css('transform', translations);
				region.el.offsetHeight; // Access the value to force redrawing
			}
		}

		/**
		 * Updates the navbar and transitions to the requested region
		 */
		showRegion(e)
		{
			e.preventDefault();

			var $link = $(e.target);
			var newActiveRegion: string = this.getRegionNameByAnchor($link);
			if (newActiveRegion == this.activeRegion) return; // Avoid re-translating when not needed

			this.activeRegion = newActiveRegion;

			this.ui.navBar.find('li').removeClass('active');
			$link.parent('li').addClass('active');

			// Re-translate regions so the selected region is translated to y=0
			this.translateRegions();
		}

		updateStatus(status: ILinkStatus)
		{
			var $bar = this.$el.find('header h1 small');
			if (status.error)
				$bar.attr('class', 'text-danger').html('<em>No link</em>');
			else $bar.attr('class', 'text-success').text(`${status.connections} connected`);
		}
	}

	export class Application extends Marionette.Application
	{
		requestCollection: RequestCollection;
		rootView: RootView;

		constructor(options?: any)
		{
			if (!options) options = {};
			super(options);

			this.requestCollection = new RequestCollection();

			this.rootView = new RootView({ collection: this.requestCollection });
			this.rootView.constructor(); // Hack: see https://github.com/Microsoft/TypeScript/issues/3311
			this.rootView.render();
		}

		/**
		 * Establishes WebSocket link
		 */
		onBeforeStart(options?: any)
		{
			AppLink = io.connect(options.server, { timeout: 2000 });
			AppLink.on('connect_error', (e) => { this.rootView.updateStatus({ error: e, connections: undefined }); });
			AppLink.on('status', this.rootView.updateStatus.bind(this.rootView));

			var addRequests = (reqs) => { this.requestCollection.add(reqs, { merge: true }); };
			AppLink.on('request', addRequests);
			AppLink.on('requests', addRequests);
		}
	}
}

var App = new PizzaCompositor.Application();
App.start({ server: 'ws://localhost:8081/' });
