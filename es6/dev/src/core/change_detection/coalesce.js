import { isPresent, isBlank, looseIdentical } from 'angular2/src/facade/lang';
import { ListWrapper, Map } from 'angular2/src/facade/collection';
import { RecordType, ProtoRecord } from './proto_record';
/**
 * Removes "duplicate" records. It assumes that record evaluation does not have side-effects.
 *
 * Records that are not last in bindings are removed and all the indices of the records that depend
 * on them are updated.
 *
 * Records that are last in bindings CANNOT be removed, and instead are replaced with very cheap
 * SELF records.
 *
 * @internal
 */
export function coalesce(srcRecords) {
    let dstRecords = [];
    let excludedIdxs = [];
    let indexMap = new Map();
    let skipDepth = 0;
    let skipSources = ListWrapper.createFixedSize(srcRecords.length);
    for (let protoIndex = 0; protoIndex < srcRecords.length; protoIndex++) {
        let skipRecord = skipSources[protoIndex];
        if (isPresent(skipRecord)) {
            skipDepth--;
            skipRecord.fixedArgs[0] = dstRecords.length;
        }
        let src = srcRecords[protoIndex];
        let dst = _cloneAndUpdateIndexes(src, dstRecords, indexMap);
        if (dst.isSkipRecord()) {
            dstRecords.push(dst);
            skipDepth++;
            skipSources[dst.fixedArgs[0]] = dst;
        }
        else {
            let record = _mayBeAddRecord(dst, dstRecords, excludedIdxs, skipDepth > 0);
            indexMap.set(src.selfIndex, record.selfIndex);
        }
    }
    return _optimizeSkips(dstRecords);
}
/**
 * - Conditional skip of 1 record followed by an unconditional skip of N are replaced by  a
 *   conditional skip of N with the negated condition,
 * - Skips of 0 records are removed
 */
function _optimizeSkips(srcRecords) {
    let dstRecords = [];
    let skipSources = ListWrapper.createFixedSize(srcRecords.length);
    let indexMap = new Map();
    for (let protoIndex = 0; protoIndex < srcRecords.length; protoIndex++) {
        let skipRecord = skipSources[protoIndex];
        if (isPresent(skipRecord)) {
            skipRecord.fixedArgs[0] = dstRecords.length;
        }
        let src = srcRecords[protoIndex];
        if (src.isSkipRecord()) {
            if (src.isConditionalSkipRecord() && src.fixedArgs[0] === protoIndex + 2 &&
                protoIndex < srcRecords.length - 1 &&
                srcRecords[protoIndex + 1].mode === RecordType.SkipRecords) {
                src.mode = src.mode === RecordType.SkipRecordsIf ? RecordType.SkipRecordsIfNot :
                    RecordType.SkipRecordsIf;
                src.fixedArgs[0] = srcRecords[protoIndex + 1].fixedArgs[0];
                protoIndex++;
            }
            if (src.fixedArgs[0] > protoIndex + 1) {
                let dst = _cloneAndUpdateIndexes(src, dstRecords, indexMap);
                dstRecords.push(dst);
                skipSources[dst.fixedArgs[0]] = dst;
            }
        }
        else {
            let dst = _cloneAndUpdateIndexes(src, dstRecords, indexMap);
            dstRecords.push(dst);
            indexMap.set(src.selfIndex, dst.selfIndex);
        }
    }
    return dstRecords;
}
/**
 * Add a new record or re-use one of the existing records.
 */
function _mayBeAddRecord(record, dstRecords, excludedIdxs, excluded) {
    let match = _findFirstMatch(record, dstRecords, excludedIdxs);
    if (isPresent(match)) {
        if (record.lastInBinding) {
            dstRecords.push(_createSelfRecord(record, match.selfIndex, dstRecords.length + 1));
            match.referencedBySelf = true;
        }
        else {
            if (record.argumentToPureFunction) {
                match.argumentToPureFunction = true;
            }
        }
        return match;
    }
    if (excluded) {
        excludedIdxs.push(record.selfIndex);
    }
    dstRecords.push(record);
    return record;
}
/**
 * Returns the first `ProtoRecord` that matches the record.
 */
function _findFirstMatch(record, dstRecords, excludedIdxs) {
    return dstRecords.find(
    // TODO(vicb): optimize excludedIdxs.indexOf (sorted array)
    rr => excludedIdxs.indexOf(rr.selfIndex) == -1 && rr.mode !== RecordType.DirectiveLifecycle &&
        _haveSameDirIndex(rr, record) && rr.mode === record.mode &&
        looseIdentical(rr.funcOrValue, record.funcOrValue) &&
        rr.contextIndex === record.contextIndex && looseIdentical(rr.name, record.name) &&
        ListWrapper.equals(rr.args, record.args));
}
/**
 * Clone the `ProtoRecord` and changes the indexes for the ones in the destination array for:
 * - the arguments,
 * - the context,
 * - self
 */
function _cloneAndUpdateIndexes(record, dstRecords, indexMap) {
    let args = record.args.map(src => _srcToDstSelfIndex(indexMap, src));
    let contextIndex = _srcToDstSelfIndex(indexMap, record.contextIndex);
    let selfIndex = dstRecords.length + 1;
    return new ProtoRecord(record.mode, record.name, record.funcOrValue, args, record.fixedArgs, contextIndex, record.directiveIndex, selfIndex, record.bindingRecord, record.lastInBinding, record.lastInDirective, record.argumentToPureFunction, record.referencedBySelf, record.propertyBindingIndex);
}
/**
 * Returns the index in the destination array corresponding to the index in the src array.
 * When the element is not present in the destination array, return the source index.
 */
function _srcToDstSelfIndex(indexMap, srcIdx) {
    var dstIdx = indexMap.get(srcIdx);
    return isPresent(dstIdx) ? dstIdx : srcIdx;
}
function _createSelfRecord(r, contextIndex, selfIndex) {
    return new ProtoRecord(RecordType.Self, 'self', null, [], r.fixedArgs, contextIndex, r.directiveIndex, selfIndex, r.bindingRecord, r.lastInBinding, r.lastInDirective, false, false, r.propertyBindingIndex);
}
function _haveSameDirIndex(a, b) {
    var di1 = isBlank(a.directiveIndex) ? null : a.directiveIndex.directiveIndex;
    var ei1 = isBlank(a.directiveIndex) ? null : a.directiveIndex.elementIndex;
    var di2 = isBlank(b.directiveIndex) ? null : b.directiveIndex.directiveIndex;
    var ei2 = isBlank(b.directiveIndex) ? null : b.directiveIndex.elementIndex;
    return di1 === di2 && ei1 === ei2;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29hbGVzY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkaWZmaW5nX3BsdWdpbl93cmFwcGVyLW91dHB1dF9wYXRoLXczRFJsWEppLnRtcC9hbmd1bGFyMi9zcmMvY29yZS9jaGFuZ2VfZGV0ZWN0aW9uL2NvYWxlc2NlLnRzIl0sIm5hbWVzIjpbImNvYWxlc2NlIiwiX29wdGltaXplU2tpcHMiLCJfbWF5QmVBZGRSZWNvcmQiLCJfZmluZEZpcnN0TWF0Y2giLCJfY2xvbmVBbmRVcGRhdGVJbmRleGVzIiwiX3NyY1RvRHN0U2VsZkluZGV4IiwiX2NyZWF0ZVNlbGZSZWNvcmQiLCJfaGF2ZVNhbWVEaXJJbmRleCJdLCJtYXBwaW5ncyI6Ik9BQU8sRUFBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBQyxNQUFNLDBCQUEwQjtPQUNwRSxFQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUMsTUFBTSxnQ0FBZ0M7T0FDeEQsRUFBQyxVQUFVLEVBQUUsV0FBVyxFQUFDLE1BQU0sZ0JBQWdCO0FBRXREOzs7Ozs7Ozs7O0dBVUc7QUFDSCx5QkFBeUIsVUFBeUI7SUFDaERBLElBQUlBLFVBQVVBLEdBQUdBLEVBQUVBLENBQUNBO0lBQ3BCQSxJQUFJQSxZQUFZQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUN0QkEsSUFBSUEsUUFBUUEsR0FBd0JBLElBQUlBLEdBQUdBLEVBQWtCQSxDQUFDQTtJQUM5REEsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDbEJBLElBQUlBLFdBQVdBLEdBQWtCQSxXQUFXQSxDQUFDQSxlQUFlQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUVoRkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsR0FBR0EsQ0FBQ0EsRUFBRUEsVUFBVUEsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsRUFBRUEsVUFBVUEsRUFBRUEsRUFBRUEsQ0FBQ0E7UUFDdEVBLElBQUlBLFVBQVVBLEdBQUdBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ3pDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDWkEsVUFBVUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBRURBLElBQUlBLEdBQUdBLEdBQUdBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ2pDQSxJQUFJQSxHQUFHQSxHQUFHQSxzQkFBc0JBLENBQUNBLEdBQUdBLEVBQUVBLFVBQVVBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1FBRTVEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLFNBQVNBLEVBQUVBLENBQUNBO1lBQ1pBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNOQSxJQUFJQSxNQUFNQSxHQUFHQSxlQUFlQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFVQSxFQUFFQSxZQUFZQSxFQUFFQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzRUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDaERBLENBQUNBO0lBQ0hBLENBQUNBO0lBRURBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0FBQ3BDQSxDQUFDQTtBQUVEOzs7O0dBSUc7QUFDSCx3QkFBd0IsVUFBeUI7SUFDL0NDLElBQUlBLFVBQVVBLEdBQUdBLEVBQUVBLENBQUNBO0lBQ3BCQSxJQUFJQSxXQUFXQSxHQUFHQSxXQUFXQSxDQUFDQSxlQUFlQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUNqRUEsSUFBSUEsUUFBUUEsR0FBd0JBLElBQUlBLEdBQUdBLEVBQWtCQSxDQUFDQTtJQUU5REEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsR0FBR0EsQ0FBQ0EsRUFBRUEsVUFBVUEsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsRUFBRUEsVUFBVUEsRUFBRUEsRUFBRUEsQ0FBQ0E7UUFDdEVBLElBQUlBLFVBQVVBLEdBQUdBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ3pDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsVUFBVUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBRURBLElBQUlBLEdBQUdBLEdBQUdBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBRWpDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsdUJBQXVCQSxFQUFFQSxJQUFJQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxVQUFVQSxHQUFHQSxDQUFDQTtnQkFDcEVBLFVBQVVBLEdBQUdBLFVBQVVBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBO2dCQUNsQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsVUFBVUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9EQSxHQUFHQSxDQUFDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxJQUFJQSxLQUFLQSxVQUFVQSxDQUFDQSxhQUFhQSxHQUFHQSxVQUFVQSxDQUFDQSxnQkFBZ0JBO29CQUMzQkEsVUFBVUEsQ0FBQ0EsYUFBYUEsQ0FBQ0E7Z0JBQzVFQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxVQUFVQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDM0RBLFVBQVVBLEVBQUVBLENBQUNBO1lBQ2ZBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0Q0EsSUFBSUEsR0FBR0EsR0FBR0Esc0JBQXNCQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFVQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDNURBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNyQkEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0E7WUFDdENBLENBQUNBO1FBRUhBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ05BLElBQUlBLEdBQUdBLEdBQUdBLHNCQUFzQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsVUFBVUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3JCQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM3Q0EsQ0FBQ0E7SUFDSEEsQ0FBQ0E7SUFFREEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FB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QkEsQ0FBQ0EsQ0FBQ0E7QUFDakdBLENBQUNBO0FBRUQsMkJBQTJCLENBQWMsRUFBRSxDQUFjO0lBQ3ZEQyxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxjQUFjQSxDQUFDQTtJQUM3RUEsSUFBSUEsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsWUFBWUEsQ0FBQ0E7SUFFM0VBLElBQUlBLEdBQUdBLEdBQUdBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLGNBQWNBLENBQUNBO0lBQzdFQSxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxZQUFZQSxDQUFDQTtJQUUzRUEsTUFBTUEsQ0FBQ0EsR0FBR0EsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0E7QUFDcENBLENBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtpc1ByZXNlbnQsIGlzQmxhbmssIGxvb3NlSWRlbnRpY2FsfSBmcm9tICdhbmd1bGFyMi9zcmMvZmFjYWRlL2xhbmcnO1xuaW1wb3J0IHtMaXN0V3JhcHBlciwgTWFwfSBmcm9tICdhbmd1bGFyMi9zcmMvZmFjYWRlL2NvbGxlY3Rpb24nO1xuaW1wb3J0IHtSZWNvcmRUeXBlLCBQcm90b1JlY29yZH0gZnJvbSAnLi9wcm90b19yZWNvcmQnO1xuXG4vKipcbiAqIFJlbW92ZXMgXCJkdXBsaWNhdGVcIiByZWNvcmRzLiBJdCBhc3N1bWVzIHRoYXQgcmVjb3JkIGV2YWx1YXRpb24gZG9lcyBub3QgaGF2ZSBzaWRlLWVmZmVjdHMuXG4gKlxuICogUmVjb3JkcyB0aGF0IGFyZSBub3QgbGFzdCBpbiBiaW5kaW5ncyBhcmUgcmVtb3ZlZCBhbmQgYWxsIHRoZSBpbmRpY2VzIG9mIHRoZSByZWNvcmRzIHRoYXQgZGVwZW5kXG4gKiBvbiB0aGVtIGFyZSB1cGRhdGVkLlxuICpcbiAqIFJlY29yZHMgdGhhdCBhcmUgbGFzdCBpbiBiaW5kaW5ncyBDQU5OT1QgYmUgcmVtb3ZlZCwgYW5kIGluc3RlYWQgYXJlIHJlcGxhY2VkIHdpdGggdmVyeSBjaGVhcFxuICogU0VMRiByZWNvcmRzLlxuICpcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gY29hbGVzY2Uoc3JjUmVjb3JkczogUHJvdG9SZWNvcmRbXSk6IFByb3RvUmVjb3JkW10ge1xuICBsZXQgZHN0UmVjb3JkcyA9IFtdO1xuICBsZXQgZXhjbHVkZWRJZHhzID0gW107XG4gIGxldCBpbmRleE1hcDogTWFwPG51bWJlciwgbnVtYmVyPiA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gIGxldCBza2lwRGVwdGggPSAwO1xuICBsZXQgc2tpcFNvdXJjZXM6IFByb3RvUmVjb3JkW10gPSBMaXN0V3JhcHBlci5jcmVhdGVGaXhlZFNpemUoc3JjUmVjb3Jkcy5sZW5ndGgpO1xuXG4gIGZvciAobGV0IHByb3RvSW5kZXggPSAwOyBwcm90b0luZGV4IDwgc3JjUmVjb3Jkcy5sZW5ndGg7IHByb3RvSW5kZXgrKykge1xuICAgIGxldCBza2lwUmVjb3JkID0gc2tpcFNvdXJjZXNbcHJvdG9JbmRleF07XG4gICAgaWYgKGlzUHJlc2VudChza2lwUmVjb3JkKSkge1xuICAgICAgc2tpcERlcHRoLS07XG4gICAgICBza2lwUmVjb3JkLmZpeGVkQXJnc1swXSA9IGRzdFJlY29yZHMubGVuZ3RoO1xuICAgIH1cblxuICAgIGxldCBzcmMgPSBzcmNSZWNvcmRzW3Byb3RvSW5kZXhdO1xuICAgIGxldCBkc3QgPSBfY2xvbmVBbmRVcGRhdGVJbmRleGVzKHNyYywgZHN0UmVjb3JkcywgaW5kZXhNYXApO1xuXG4gICAgaWYgKGRzdC5pc1NraXBSZWNvcmQoKSkge1xuICAgICAgZHN0UmVjb3Jkcy5wdXNoKGRzdCk7XG4gICAgICBza2lwRGVwdGgrKztcbiAgICAgIHNraXBTb3VyY2VzW2RzdC5maXhlZEFyZ3NbMF1dID0gZHN0O1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgcmVjb3JkID0gX21heUJlQWRkUmVjb3JkKGRzdCwgZHN0UmVjb3JkcywgZXhjbHVkZWRJZHhzLCBza2lwRGVwdGggPiAwKTtcbiAgICAgIGluZGV4TWFwLnNldChzcmMuc2VsZkluZGV4LCByZWNvcmQuc2VsZkluZGV4KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gX29wdGltaXplU2tpcHMoZHN0UmVjb3Jkcyk7XG59XG5cbi8qKlxuICogLSBDb25kaXRpb25hbCBza2lwIG9mIDEgcmVjb3JkIGZvbGxvd2VkIGJ5IGFuIHVuY29uZGl0aW9uYWwgc2tpcCBvZiBOIGFyZSByZXBsYWNlZCBieSAgYVxuICogICBjb25kaXRpb25hbCBza2lwIG9mIE4gd2l0aCB0aGUgbmVnYXRlZCBjb25kaXRpb24sXG4gKiAtIFNraXBzIG9mIDAgcmVjb3JkcyBhcmUgcmVtb3ZlZFxuICovXG5mdW5jdGlvbiBfb3B0aW1pemVTa2lwcyhzcmNSZWNvcmRzOiBQcm90b1JlY29yZFtdKTogUHJvdG9SZWNvcmRbXSB7XG4gIGxldCBkc3RSZWNvcmRzID0gW107XG4gIGxldCBza2lwU291cmNlcyA9IExpc3RXcmFwcGVyLmNyZWF0ZUZpeGVkU2l6ZShzcmNSZWNvcmRzLmxlbmd0aCk7XG4gIGxldCBpbmRleE1hcDogTWFwPG51bWJlciwgbnVtYmVyPiA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5cbiAgZm9yIChsZXQgcHJvdG9JbmRleCA9IDA7IHByb3RvSW5kZXggPCBzcmNSZWNvcmRzLmxlbmd0aDsgcHJvdG9JbmRleCsrKSB7XG4gICAgbGV0IHNraXBSZWNvcmQgPSBza2lwU291cmNlc1twcm90b0luZGV4XTtcbiAgICBpZiAoaXNQcmVzZW50KHNraXBSZWNvcmQpKSB7XG4gICAgICBza2lwUmVjb3JkLmZpeGVkQXJnc1swXSA9IGRzdFJlY29yZHMubGVuZ3RoO1xuICAgIH1cblxuICAgIGxldCBzcmMgPSBzcmNSZWNvcmRzW3Byb3RvSW5kZXhdO1xuXG4gICAgaWYgKHNyYy5pc1NraXBSZWNvcmQoKSkge1xuICAgICAgaWYgKHNyYy5pc0NvbmRpdGlvbmFsU2tpcFJlY29yZCgpICYmIHNyYy5maXhlZEFyZ3NbMF0gPT09IHByb3RvSW5kZXggKyAyICYmXG4gICAgICAgICAgcHJvdG9JbmRleCA8IHNyY1JlY29yZHMubGVuZ3RoIC0gMSAmJlxuICAgICAgICAgIHNyY1JlY29yZHNbcHJvdG9JbmRleCArIDFdLm1vZGUgPT09IFJlY29yZFR5cGUuU2tpcFJlY29yZHMpIHtcbiAgICAgICAgc3JjLm1vZGUgPSBzcmMubW9kZSA9PT0gUmVjb3JkVHlwZS5Ta2lwUmVjb3Jkc0lmID8gUmVjb3JkVHlwZS5Ta2lwUmVjb3Jkc0lmTm90IDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUmVjb3JkVHlwZS5Ta2lwUmVjb3Jkc0lmO1xuICAgICAgICBzcmMuZml4ZWRBcmdzWzBdID0gc3JjUmVjb3Jkc1twcm90b0luZGV4ICsgMV0uZml4ZWRBcmdzWzBdO1xuICAgICAgICBwcm90b0luZGV4Kys7XG4gICAgICB9XG5cbiAgICAgIGlmIChzcmMuZml4ZWRBcmdzWzBdID4gcHJvdG9JbmRleCArIDEpIHtcbiAgICAgICAgbGV0IGRzdCA9IF9jbG9uZUFuZFVwZGF0ZUluZGV4ZXMoc3JjLCBkc3RSZWNvcmRzLCBpbmRleE1hcCk7XG4gICAgICAgIGRzdFJlY29yZHMucHVzaChkc3QpO1xuICAgICAgICBza2lwU291cmNlc1tkc3QuZml4ZWRBcmdzWzBdXSA9IGRzdDtcbiAgICAgIH1cblxuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZHN0ID0gX2Nsb25lQW5kVXBkYXRlSW5kZXhlcyhzcmMsIGRzdFJlY29yZHMsIGluZGV4TWFwKTtcbiAgICAgIGRzdFJlY29yZHMucHVzaChkc3QpO1xuICAgICAgaW5kZXhNYXAuc2V0KHNyYy5zZWxmSW5kZXgsIGRzdC5zZWxmSW5kZXgpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBkc3RSZWNvcmRzO1xufVxuXG4vKipcbiAqIEFkZCBhIG5ldyByZWNvcmQgb3IgcmUtdXNlIG9uZSBvZiB0aGUgZXhpc3RpbmcgcmVjb3Jkcy5cbiAqL1xuZnVuY3Rpb24gX21heUJlQWRkUmVjb3JkKFxuICAgIHJlY29yZDogUHJvdG9SZWNvcmQsIGRzdFJlY29yZHM6IFByb3RvUmVjb3JkW10sIGV4Y2x1ZGVkSWR4czogbnVtYmVyW10sXG4gICAgZXhjbHVkZWQ6IGJvb2xlYW4pOiBQcm90b1JlY29yZCB7XG4gIGxldCBtYXRjaCA9IF9maW5kRmlyc3RNYXRjaChyZWNvcmQsIGRzdFJlY29yZHMsIGV4Y2x1ZGVkSWR4cyk7XG5cbiAgaWYgKGlzUHJlc2VudChtYXRjaCkpIHtcbiAgICBpZiAocmVjb3JkLmxhc3RJbkJpbmRpbmcpIHtcbiAgICAgIGRzdFJlY29yZHMucHVzaChfY3JlYXRlU2VsZlJlY29yZChyZWNvcmQsIG1hdGNoLnNlbGZJbmRleCwgZHN0UmVjb3Jkcy5sZW5ndGggKyAxKSk7XG4gICAgICBtYXRjaC5yZWZlcmVuY2VkQnlTZWxmID0gdHJ1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHJlY29yZC5hcmd1bWVudFRvUHVyZUZ1bmN0aW9uKSB7XG4gICAgICAgIG1hdGNoLmFyZ3VtZW50VG9QdXJlRnVuY3Rpb24gPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBtYXRjaDtcbiAgfVxuXG4gIGlmIChleGNsdWRlZCkge1xuICAgIGV4Y2x1ZGVkSWR4cy5wdXNoKHJlY29yZC5zZWxmSW5kZXgpO1xuICB9XG5cbiAgZHN0UmVjb3Jkcy5wdXNoKHJlY29yZCk7XG4gIHJldHVybiByZWNvcmQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZmlyc3QgYFByb3RvUmVjb3JkYCB0aGF0IG1hdGNoZXMgdGhlIHJlY29yZC5cbiAqL1xuZnVuY3Rpb24gX2ZpbmRGaXJzdE1hdGNoKFxuICAgIHJlY29yZDogUHJvdG9SZWNvcmQsIGRzdFJlY29yZHM6IFByb3RvUmVjb3JkW10sIGV4Y2x1ZGVkSWR4czogbnVtYmVyW10pOiBQcm90b1JlY29yZCB7XG4gIHJldHVybiBkc3RSZWNvcmRzLmZpbmQoXG4gICAgICAvLyBUT0RPKHZpY2IpOiBvcHRpbWl6ZSBleGNsdWRlZElkeHMuaW5kZXhPZiAoc29ydGVkIGFycmF5KVxuICAgICAgcnIgPT4gZXhjbHVkZWRJZHhzLmluZGV4T2YocnIuc2VsZkluZGV4KSA9PSAtMSAmJiByci5tb2RlICE9PSBSZWNvcmRUeXBlLkRpcmVjdGl2ZUxpZmVjeWNsZSAmJlxuICAgICAgICAgIF9oYXZlU2FtZURpckluZGV4KHJyLCByZWNvcmQpICYmIHJyLm1vZGUgPT09IHJlY29yZC5tb2RlICYmXG4gICAgICAgICAgbG9vc2VJZGVudGljYWwocnIuZnVuY09yVmFsdWUsIHJlY29yZC5mdW5jT3JWYWx1ZSkgJiZcbiAgICAgICAgICByci5jb250ZXh0SW5kZXggPT09IHJlY29yZC5jb250ZXh0SW5kZXggJiYgbG9vc2VJZGVudGljYWwocnIubmFtZSwgcmVjb3JkLm5hbWUpICYmXG4gICAgICAgICAgTGlzdFdyYXBwZXIuZXF1YWxzKHJyLmFyZ3MsIHJlY29yZC5hcmdzKSk7XG59XG5cbi8qKlxuICogQ2xvbmUgdGhlIGBQcm90b1JlY29yZGAgYW5kIGNoYW5nZXMgdGhlIGluZGV4ZXMgZm9yIHRoZSBvbmVzIGluIHRoZSBkZXN0aW5hdGlvbiBhcnJheSBmb3I6XG4gKiAtIHRoZSBhcmd1bWVudHMsXG4gKiAtIHRoZSBjb250ZXh0LFxuICogLSBzZWxmXG4gKi9cbmZ1bmN0aW9uIF9jbG9uZUFuZFVwZGF0ZUluZGV4ZXMoXG4gICAgcmVjb3JkOiBQcm90b1JlY29yZCwgZHN0UmVjb3JkczogUHJvdG9SZWNvcmRbXSwgaW5kZXhNYXA6IE1hcDxudW1iZXIsIG51bWJlcj4pOiBQcm90b1JlY29yZCB7XG4gIGxldCBhcmdzID0gcmVjb3JkLmFyZ3MubWFwKHNyYyA9PiBfc3JjVG9Ec3RTZWxmSW5kZXgoaW5kZXhNYXAsIHNyYykpO1xuICBsZXQgY29udGV4dEluZGV4ID0gX3NyY1RvRHN0U2VsZkluZGV4KGluZGV4TWFwLCByZWNvcmQuY29udGV4dEluZGV4KTtcbiAgbGV0IHNlbGZJbmRleCA9IGRzdFJlY29yZHMubGVuZ3RoICsgMTtcblxuICByZXR1cm4gbmV3IFByb3RvUmVjb3JkKFxuICAgICAgcmVjb3JkLm1vZGUsIHJlY29yZC5uYW1lLCByZWNvcmQuZnVuY09yVmFsdWUsIGFyZ3MsIHJlY29yZC5maXhlZEFyZ3MsIGNvbnRleHRJbmRleCxcbiAgICAgIHJlY29yZC5kaXJlY3RpdmVJbmRleCwgc2VsZkluZGV4LCByZWNvcmQuYmluZGluZ1JlY29yZCwgcmVjb3JkLmxhc3RJbkJpbmRpbmcsXG4gICAgICByZWNvcmQubGFzdEluRGlyZWN0aXZlLCByZWNvcmQuYXJndW1lbnRUb1B1cmVGdW5jdGlvbiwgcmVjb3JkLnJlZmVyZW5jZWRCeVNlbGYsXG4gICAgICByZWNvcmQucHJvcGVydHlCaW5kaW5nSW5kZXgpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGluZGV4IGluIHRoZSBkZXN0aW5hdGlvbiBhcnJheSBjb3JyZXNwb25kaW5nIHRvIHRoZSBpbmRleCBpbiB0aGUgc3JjIGFycmF5LlxuICogV2hlbiB0aGUgZWxlbWVudCBpcyBub3QgcHJlc2VudCBpbiB0aGUgZGVzdGluYXRpb24gYXJyYXksIHJldHVybiB0aGUgc291cmNlIGluZGV4LlxuICovXG5mdW5jdGlvbiBfc3JjVG9Ec3RTZWxmSW5kZXgoaW5kZXhNYXA6IE1hcDxudW1iZXIsIG51bWJlcj4sIHNyY0lkeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgdmFyIGRzdElkeCA9IGluZGV4TWFwLmdldChzcmNJZHgpO1xuICByZXR1cm4gaXNQcmVzZW50KGRzdElkeCkgPyBkc3RJZHggOiBzcmNJZHg7XG59XG5cbmZ1bmN0aW9uIF9jcmVhdGVTZWxmUmVjb3JkKHI6IFByb3RvUmVjb3JkLCBjb250ZXh0SW5kZXg6IG51bWJlciwgc2VsZkluZGV4OiBudW1iZXIpOiBQcm90b1JlY29yZCB7XG4gIHJldHVybiBuZXcgUHJvdG9SZWNvcmQoXG4gICAgICBSZWNvcmRUeXBlLlNlbGYsICdzZWxmJywgbnVsbCwgW10sIHIuZml4ZWRBcmdzLCBjb250ZXh0SW5kZXgsIHIuZGlyZWN0aXZlSW5kZXgsIHNlbGZJbmRleCxcbiAgICAgIHIuYmluZGluZ1JlY29yZCwgci5sYXN0SW5CaW5kaW5nLCByLmxhc3RJbkRpcmVjdGl2ZSwgZmFsc2UsIGZhbHNlLCByLnByb3BlcnR5QmluZGluZ0luZGV4KTtcbn1cblxuZnVuY3Rpb24gX2hhdmVTYW1lRGlySW5kZXgoYTogUHJvdG9SZWNvcmQsIGI6IFByb3RvUmVjb3JkKTogYm9vbGVhbiB7XG4gIHZhciBkaTEgPSBpc0JsYW5rKGEuZGlyZWN0aXZlSW5kZXgpID8gbnVsbCA6IGEuZGlyZWN0aXZlSW5kZXguZGlyZWN0aXZlSW5kZXg7XG4gIHZhciBlaTEgPSBpc0JsYW5rKGEuZGlyZWN0aXZlSW5kZXgpID8gbnVsbCA6IGEuZGlyZWN0aXZlSW5kZXguZWxlbWVudEluZGV4O1xuXG4gIHZhciBkaTIgPSBpc0JsYW5rKGIuZGlyZWN0aXZlSW5kZXgpID8gbnVsbCA6IGIuZGlyZWN0aXZlSW5kZXguZGlyZWN0aXZlSW5kZXg7XG4gIHZhciBlaTIgPSBpc0JsYW5rKGIuZGlyZWN0aXZlSW5kZXgpID8gbnVsbCA6IGIuZGlyZWN0aXZlSW5kZXguZWxlbWVudEluZGV4O1xuXG4gIHJldHVybiBkaTEgPT09IGRpMiAmJiBlaTEgPT09IGVpMjtcbn1cbiJdfQ==