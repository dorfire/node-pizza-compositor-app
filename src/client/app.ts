/// <reference path="../../typings/tsd.d.ts" />

module PizzaCompositor {
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
		Composition: compileTemplate('composition'),
		OrderRequest: compileTemplate('order-request')
	}

	const ToppingOptions: string[] = [
		'Green Olives', 'Black Olives', 'Mushrooms', 'Onions', 'Corn', 'Peppers',
		'Xtra Cheese', 'Mozzarella', 'Spinach', 'Tomatoes', 'Pepperoni', 'Bacon',
		'Anchovies', 'Pineapple'
	];


	interface ILinkStatus
	{
		error: any;
		connections: number;
	}

	/**
	 * Represents a pizza slice request from a single person.
	 */
	class RequestModel extends Backbone.Model {
		defaults() {
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
		sync() {
			var data = this.toJSON();
			delete data.toppingOptions;
			if (data.name) // Don't send without a name
				AppLink.emit('upsert', data);
		}
	}
	RequestModel.prototype.idAttribute = 'name';

	class RequestCollection extends Backbone.Collection<RequestModel>
	{
		model = RequestModel;
	}

	class CompositionView extends Marionette.ItemView<RequestModel>
	{
		template = Templates.Composition;

		ui = {
			sliceInput: 'input#slices',
			approxCheckbox: 'input#approx'
		};

		events = {
			'change input#name': (e) => {
				this.model = new RequestModel({ name: e.target.value });
				this.bindEntityEvents(this.model, this.getOption('modelEvents'));
				this.updateViewFields();
			},
			'change input#slices': this.onChangedSlices,
			'change input#approx': this.onCheckedApprox,
			'change #toppings input': this.onCheckedTopping,
		};

		modelEvents = {
			'change': this.upsert
		};

		onChangedSlices(e) {
			var sliceCount = +e.target.value;
			this.model.set('slices', sliceCount);

			if (sliceCount == 1)
				this.ui.approxCheckbox.attr('checked', false);

			this.ui.approxCheckbox.attr('disabled', (sliceCount == 1));
		}

		getToppingListItemByName(name: string): JQuery {
			return this.$el.find(`#toppings li[data-id="${name}"]`);
		}

		onCheckedTopping(e) {
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
		updateToppingCounter($topping: JQuery, count: number): void {
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
		updateViewFields() {
			this.ui.sliceInput.val(this.model.get('slices'));
			this.ui.approxCheckbox.attr('checked', this.model.get('approx'));
			this.$el.find('#toppings input[type=checkbox]').attr('checked', false); // TODO: loop through selected toppings
		}

		upsert() {
			console.log('upsert() due to changed attrs:', this.model.changed);
			this.model.save();
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

		regions = {
			composition: '#region-composition',
			order: {
				selector: '#region-order',
				regionClass: ExistingMarkupRegion
			}
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
			var compView = new CompositionView({ model: new RequestModel() });
			compView.constructor(); // Hack: binds events and ui
			this.showChildView('composition', compView);

			var orderView = new Marionette.CollectionView({
				el: 'dl',
				collection: this.getOption('collection'),
				childView: OrderRequestView,
				collectionEvents: {'change': 'render'},
			});
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

			var outerHeights = -this.ui.navBar.outerHeight();
			for (let i in regionNames)
			{
				var region = this.getRegion(regionNames[i]);

				outerHeights += region.$el.outerHeight(true);
				if (region.$el.data('offsetY') == undefined)
				{
					if (i > 0)
						region.$el.data('offsetY', -outerHeights);
					else
						region.$el.data('offsetY', 0);
				}

				var j = i - activeRegionIndex;
				var translations = `translateX(${100 * j}%) translateY(${region.$el.data('offsetY')}px)`;
				region.$el.css('transform', translations);
				region.el.offsetHeight; // Access the value to force redrawing
			}
		}

		/**
		 * Updates the navbar and transitions to the requested region
		 */
		showRegion(e)
		{
			var $link = $(e.target);

			var newActiveRegion: string = this.getRegionNameByAnchor($link);
			if (newActiveRegion == this.activeRegion) return; // Avoid re-translating when not needed

			this.activeRegion = newActiveRegion;

			this.ui.navBar.find('li').removeClass('active');
			$link.parent('li').addClass('active');

			// Re-translate regions so the selected region is translated to y=0
			this.translateRegions();

			e.preventDefault();
		}

		updateStatus(status: ILinkStatus)
		{
			var $bar = this.$el.find('header h1 small');
			if (status.error)
				$bar.attr('class', 'text-danger').html('<em>No link</em>');
			else $bar.attr('class', 'text-success').text(`${status.connections} connected`);
		}
	}

	export class App extends Marionette.Application {
		requestCollection: RequestCollection;
		rootView: RootView;

		constructor(options?: any) {
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
		onBeforeStart(options?: any) {
			AppLink = io.connect(options.server, { timeout: 2000 });
			AppLink.on('connect_error', (e) => { this.rootView.updateStatus({ error: e, connections: undefined }); });
			AppLink.on('status', this.rootView.updateStatus.bind(this.rootView));

			var addRequests = (reqs) => { this.requestCollection.add(reqs, { merge: true }); };
			AppLink.on('request', addRequests);
			AppLink.on('requests', addRequests);
		}
	}
}

var App = new PizzaCompositor.App();
App.start({ server: 'http://localhost:8081/' });
