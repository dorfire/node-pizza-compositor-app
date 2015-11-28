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
				delete toppings[i];
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
	class ExistingMarkupRegion extends Marionette.Region {
		attachHtml() { /* no-op */ }
	}

	class RootView extends Marionette.LayoutView<Backbone.Model>
	{
		template = false;
		el = 'main#app';

		ui = {
			titleBar: 'header #title-bar',
			status: 'header h1 small',
			navBar: 'header nav.navbar'
		};

		regions = {
			composition: '#region-composition',
			order: {
				selector: '#region-order dl',
				regionClass: ExistingMarkupRegion
			}
		};

		initialize()
		{
			$(window).on('scroll', this.onWindowScroll.bind(this));
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
				collectionEvents: {'change': 'render'}
			});
			this.showChildView('order', orderView);
		}

		onWindowScroll(e)
		{
			var scrollTop = $(window).scrollTop();
			var titleBarHeight = this.ui.titleBar.outerHeight();
			console.log(scrollTop);

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

		updateStatus(status) {
			this.$el.find('header h1 small').text(`${status.connections} connected`);
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
			AppLink.on('connect_timeout', (e) => { console.error('Could not connect'); });

			AppLink.on('status', this.rootView.updateStatus.bind(this.rootView));

			var addRequests = (reqs) => { this.requestCollection.add(reqs, { merge: true }); };
			AppLink.on('request', addRequests);
			AppLink.on('requests', addRequests);
		}
	}
}

var App = new PizzaCompositor.App();
App.start({ server: 'http://localhost:1337/' });
