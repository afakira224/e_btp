import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../entities/json.dart';
import '../../../entities/support.dart';
import '../../../shared/api/api_client.dart';

// ─────────────────────────────────────────────
//  Support — les routes de Back/src/routers/router/support.route.ts et
//  sanction.route.ts, côté demandeur (scope=mine).
// ─────────────────────────────────────────────

class TicketPage {
  const TicketPage({required this.tickets, required this.open, required this.done});

  final List<SupportTicket> tickets;
  final int open;
  final int done;
}

class SupportApi {
  const SupportApi(this._api);

  final ApiClient _api;

  Future<TicketPage> tickets({required bool open}) async {
    final data = (await _api.get('/support/tickets${query({'scope': 'mine', 'tab': open ? 'open' : 'done', 'limit': 50})}')).map;
    final counts = object(data, 'counts') ?? const {};
    return TicketPage(tickets: objects(data, 'tickets').map(SupportTicket.fromJson).toList(), open: integer(counts, 'open'), done: integer(counts, 'done'));
  }

  Future<SupportTicket> ticket(String id) async => SupportTicket.fromJson((await _api.get('/support/tickets/${Uri.encodeComponent(id)}')).map);

  /// Nouvelle demande ; `targetId` = la sous-commande, l'annonce ou la boutique visée.
  Future<({SupportTicket ticket, String message})> create({required SupportTicketType type, required String reason, required String description, String? subject, String? targetId}) async {
    final response = await _api.post('/support/tickets', {
      'type': type.value,
      'reason': reason,
      'description': description,
      if (subject != null && subject.trim().isNotEmpty) 'subject': subject.trim(),
      'targetId': ?targetId,
    });
    return (ticket: SupportTicket.fromJson(response.map), message: response.message);
  }

  Future<SupportTicket> postMessage(String id, String body) async => SupportTicket.fromJson((await _api.post('/support/tickets/${Uri.encodeComponent(id)}/messages', {'body': body})).map);

  Future<({SupportTicket ticket, String message})> action(String id, SupportAction action, {String? reason, int? rating, String? comment}) async {
    final response = await _api.patch('/support/tickets/${Uri.encodeComponent(id)}/${action.value}', {
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      'rating': ?rating,
      if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
    });
    return (ticket: SupportTicket.fromJson(response.map), message: response.message);
  }

  /// « Nous contacter » : public, la réponse part par email.
  Future<String> contact({required String name, required String email, required String reason, required String message}) async =>
      (await _api.post('/support/contact', {'name': name, 'email': email, 'reason': reason, 'message': message})).message;

  Future<List<Sanction>> mySanctions() async => (await _api.get('/sanctions/mine')).list.whereType<Map>().map((e) => Sanction.fromJson(e.cast())).toList();
}

final supportApiProvider = Provider((ref) => SupportApi(ref.watch(apiClientProvider)));

final ticketsProvider = FutureProvider.autoDispose.family<TicketPage, bool>((ref, open) => ref.watch(supportApiProvider).tickets(open: open));
final ticketProvider = FutureProvider.autoDispose.family<SupportTicket, String>((ref, id) => ref.watch(supportApiProvider).ticket(id));
final mySanctionsProvider = FutureProvider.autoDispose<List<Sanction>>((ref) => ref.watch(supportApiProvider).mySanctions());
